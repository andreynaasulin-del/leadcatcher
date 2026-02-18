import asyncio
from playwright.async_api import async_playwright, Page, TimeoutError as PlaywrightTimeoutError
from typing import List, Dict, Any
import random
import re
from tqdm.asyncio import tqdm
from .config import HEADLESS, SCROLL_COUNT, MAX_CONCURRENT_BROWSERS

class MapsScraper:
    def __init__(self):
        pass 

    async def scrape_query(self, query: str) -> List[Dict[str, Any]]:
        print(f"🔍 Searching for: {query}")
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=HEADLESS)
            context = await browser.new_context(
                viewport={'width': 1280, 'height': 800},
                user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            )
            page = await context.new_page()

            # --- PHASE 1: SEARCH & COLLECT PLACE URLs ---
            place_urls = set()
            try:
                encoded_query = query.replace(' ', '+')
                url = f"https://www.google.com/maps/search/{encoded_query}"
                await page.goto(url, wait_until="domcontentloaded")
                
                feed_selector = 'div[role="feed"]'
                try:
                    await page.wait_for_selector(feed_selector, timeout=10000)
                except PlaywrightTimeoutError:
                    print(f"⚠️ Could not find results feed. Selectors might be broken.")
                    await browser.close()
                    return []

                print("📜 Scrolling...")
                pbar = tqdm(range(SCROLL_COUNT), desc="Scrolling Feed")
                for _ in pbar:
                    await page.evaluate(f"document.querySelector('{feed_selector}').scrollTop = document.querySelector('{feed_selector}').scrollHeight")
                    await page.wait_for_timeout(2000)

                links = await page.locator(f'{feed_selector} a[href*="/maps/place/"]').all()
                
                for link in links:
                    href = await link.get_attribute('href')
                    if href:
                        clean_url = href.split('?')[0]
                        place_urls.add(clean_url)
                
                print(f"📍 Collected {len(place_urls)} unique places. Fetching details...")
                
            except Exception as e:
                print(f"❌ Error during search phase: {e}")
                await browser.close()
                return []
            
            # --- PHASE 2: VISIT EACH PLACE & EXTRACT DETAILS ---
            # Max items to process to avoid getting blocked or taking too long
            MAX_ITEMS = 50
            urls_to_visit = list(place_urls)[:MAX_ITEMS]
            
            sem = asyncio.Semaphore(MAX_CONCURRENT_BROWSERS)

            async def process_place(url):
                async with sem:
                    # New page for isolation
                    try:
                        p = await context.new_page()
                        await p.goto(url, wait_until="domcontentloaded", timeout=15000)
                        
                        # Data Extraction
                        name = "Unknown"
                        try:
                            # Try different selectors for Name (H1 is usually most reliable)
                            await p.wait_for_selector("h1", timeout=5000)
                            name = await p.locator("h1").first.text_content()
                        except:
                            pass

                        # Website - look for button with data-item-id="authority"
                        website_btn = p.locator('a[data-item-id="authority"]').first
                        website = await website_btn.get_attribute("href") if await website_btn.count() > 0 else None

                        # Phone - data-item-id="phone:tel:..."
                        phone_btn = p.locator('button[data-item-id^="phone:tel:"]').first
                        phone = None
                        if await phone_btn.count() > 0:
                            aria = await phone_btn.get_attribute("aria-label")
                            if aria:
                                phone = aria.replace("Phone: ", "")
                        
                        # Rating
                        rating = "N/A"
                        reviews = "0"
                        star_elm = p.locator('span[aria-label*=" stars "][aria-label*=" Reviews"]').first
                        if await star_elm.count() > 0:
                            aria = await star_elm.get_attribute("aria-label")
                            parts = aria.split(" stars ")
                            if len(parts) > 0:
                                rating = parts[0].strip()
                            if len(parts) > 1:
                                reviews = parts[1].replace("Reviews", "").replace("reviews", "").strip().replace(',', '')

                        await p.close()

                        return {
                            "Business Name": name,
                            "Website": website,
                            "Phone": phone,
                            "Rating": rating,
                            "Review Count": reviews,
                            "Google Maps URL": url,
                            "Search Query": query
                        }
                    except Exception as e:
                        # Silently fail for individual listings to keep progress moving
                        return None

            tasks = [process_place(u) for u in urls_to_visit]
            
            try:
                processed_results = await tqdm.gather(*tasks, desc="Scraping Details")
            except AttributeError:
                processed_results = await asyncio.gather(*tasks)
            
            # Filter None
            clean_results = [r for r in processed_results if r is not None]
            
            await browser.close()
            return clean_results

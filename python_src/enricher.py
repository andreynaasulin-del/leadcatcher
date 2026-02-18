import asyncio
from playwright.async_api import async_playwright
import re
from typing import Dict, Any, List
from tqdm.asyncio import tqdm
from .config import HEADLESS, MAX_CONCURRENT_BROWSERS

class LeadEnricher:
    def __init__(self):
        pass

    async def enrich_leads(self, leads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        print(f"🚀 Enriching {len(leads)} leads...")
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=HEADLESS)
            context = await browser.new_context(
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            )
            
            sem = asyncio.Semaphore(MAX_CONCURRENT_BROWSERS)

            async def process_lead(lead):
                url = lead.get("Website")
                if not url:
                    lead["Missing_Pixel"] = False
                    lead["Missing_Analytics"] = False
                    lead["Mobile_Friendly"] = False
                    return lead

                if not url.startswith("http"):
                    url = "https://" + url

                async with sem:
                    try:
                        page = await context.new_page()
                        # Set timeout to 15s
                        await page.goto(url, wait_until="domcontentloaded", timeout=15000)
                        
                        content = await page.content()
                        
                        # Check Pixel
                        has_pixel = bool(re.search(r'fbevents\.js|fbq\(', content, re.IGNORECASE))
                        
                        # Check Analytics
                        has_analytics = bool(re.search(r'gtag|analytics\.js|googletagmanager', content, re.IGNORECASE))
                        
                        # Check Responsive (viewport meta)
                        has_viewport = await page.locator('meta[name="viewport"]').count() > 0
                        
                        # Text Content
                        try:
                            text = await page.locator('body').inner_text()
                            lead["Homepage_Text"] = text[:1000].replace('\n', ' ').strip()
                        except:
                            lead["Homepage_Text"] = ""
                        
                        lead["Missing_Pixel"] = not has_pixel
                        lead["Missing_Analytics"] = not has_analytics
                        lead["Mobile_Friendly"] = has_viewport
                        
                    except Exception as e:
                        lead["Missing_Pixel"] = True # Assume missing on error? Or None
                        lead["Missing_Analytics"] = True
                        lead["Mobile_Friendly"] = False
                        lead["Homepage_Text"] = ""
                    finally:
                        if 'page' in locals():
                            await page.close()
                return lead

            tasks = [process_lead(lead) for lead in leads]
            # Use tqdm.gather if available, else asyncio.gather
            try:
                enriched_leads = await tqdm.gather(*tasks, desc="Enriching Websites")
            except AttributeError:
                enriched_leads = await asyncio.gather(*tasks)
            
            await browser.close()
            return enriched_leads

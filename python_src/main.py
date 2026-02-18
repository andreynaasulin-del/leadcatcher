import asyncio
import pandas as pd
from src.scraper import MapsScraper
from src.enricher import LeadEnricher
from src.generator import IcebreakerGenerator

async def main():
    print("🦷 Dentist Lead Enrichment Pipeline Starting...")
    
    # Input Queries
    queries = [
        "Dentist in Miami, FL",
        "Cosmetic Dentistry Los Angeles"
    ]
    
    all_leads = []
    
    # --- PHASE 1: SCRAPE ---
    scraper = MapsScraper()
    for query in queries:
        leads = await scraper.scrape_query(query)
        all_leads.extend(leads)
    
    if not all_leads:
        print("❌ No leads found. Exiting.")
        return

    print(f"✅ Total Raw Leads: {len(all_leads)}")

    # --- PHASE 2: ENRICH ---
    enricher = LeadEnricher()
    enriched_leads = await enricher.enrich_leads(all_leads)
    
    # --- PHASE 3: GENERATE ---
    generator = IcebreakerGenerator()
    final_leads = await generator.generate_icebreakers(enriched_leads)
    
    # --- PHASE 4: SAVE ---
    df = pd.DataFrame(final_leads)
    
    # Clean up columns
    cols = ["Business Name", "Website", "Phone", "Rating", "Review Count", 
            "Missing_Pixel", "Missing_Analytics", "Mobile_Friendly", "AI_Icebreaker", 
            "Google Maps URL", "Search Query", "Homepage_Text"]
    
    # Select existing columns
    existing_cols = [c for c in cols if c in df.columns]
    df = df[existing_cols]
    
    output_file = "leads_enriched.csv"
    df.to_csv(output_file, index=False)
    print(f"🎉 Success! Saved {len(df)} leads to {output_file}")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Pipeline stopped by user.")

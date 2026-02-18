import asyncio
from openai import AsyncOpenAI
from typing import List, Dict, Any
from tqdm.asyncio import tqdm
from .config import OPENAI_API_KEY, OPENAI_MODEL

# Instantiate client once (or per request)
client = AsyncOpenAI(api_key=OPENAI_API_KEY)

class IcebreakerGenerator:
    def __init__(self):
        pass

    async def generate_icebreakers(self, leads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        print(f"🤖 Generating AI Icebreakers for {len(leads)} leads...")
        
        sem = asyncio.Semaphore(10) # Control concurrency

        async def generate(lead):
            async with sem:
                name = lead.get("Business Name", "Dr.")
                missing_pixel = lead.get("Missing_Pixel", False)
                missing_analytics = lead.get("Missing_Analytics", False)
                text_snippet = str(lead.get("Homepage_Text", ""))[:500] 

                missing_items = []
                if missing_pixel is True: missing_items.append("Facebook Pixel")
                if missing_analytics is True: missing_items.append("Google Analytics")
                
                # Logic: If missing tech, highlight it. If not, pivot to "AI Optimization"
                if missing_items:
                    missing_str = " and ".join(missing_items)
                    objective = f"tell them they are losing potential patients because they are missing {missing_str}."
                else:
                    missing_str = "Advanced AI Scheduling"
                    objective = "compliment their site, but suggest they are missing 24/7 AI lead capture."

                prompt = f"""
                Role: Direct Response Marketing Auditor.
                Client: {name}
                Missing Tech: {missing_str}
                Context: "{text_snippet}..."

                Goal: Write ONE punchy, polite, cold-email first line (under 30 words).
                Content: Only {objective}
                Tone: Professional, helpful, slightly authoritative.
                No fluff. No "I hope you are well".
                """

                try:
                    response = await client.chat.completions.create(
                        model=OPENAI_MODEL,
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=60,
                        temperature=0.7,
                        timeout=30 # Add timeout
                    )
                    icebreaker = response.choices[0].message.content.strip()
                    lead["AI_Icebreaker"] = icebreaker
                except Exception as e:
                    # print(f"Error generating icebreaker: {e}")
                    lead["AI_Icebreaker"] = "Could not generate."
                
                return lead

        tasks = [generate(l) for l in leads]
        try:
            return await tqdm.gather(*tasks, desc="Writing Icebreakers")
        except AttributeError:
             return await asyncio.gather(*tasks)

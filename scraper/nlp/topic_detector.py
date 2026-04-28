_TOPIC_KEYWORDS: dict[str, list[str]] = {
    "Healthcare": [
        "hospital", "health", "clinic", "doctor", "nurse", "medicine",
        "nhif", "sha", "medical", "disease", "treatment", "pharmacy",
        "ambulance", "maternity", "dispensary", "cancer", "malaria", "hiv",
    ],
    "Education": [
        "school", "education", "university", "college", "teacher", "student",
        "curriculum", "tvet", "bursary", "scholarship", "exam", "kcse", "kcpe",
        "cbc", "dropout", "tuition", "headteacher", "principal",
    ],
    "Land & Housing": [
        "land", "housing", "eviction", "title deed", "settlement",
        "squatter", "landlord", "rent", "property", "grabbing", "nms",
        "affordable housing", "slum", "demolition", "encroachment",
    ],
    "Water & Sanitation": [
        "water", "sanitation", "sewage", "drought", "pipe", "borehole",
        "water shortage", "flush", "nwsc", "toilet", "latrine", "clean water",
        "flooding", "sewerage",
    ],
    "Roads & Transport": [
        "road", "highway", "sgr", "matatu", "potholes", "traffic",
        "transport", "bus", "infrastructure", "bridge", "ketraco",
        "tarmac", "passable", "impassable", "flyover", "bypass",
    ],
    "Security & Police": [
        "police", "security", "crime", "robbery", "shooting", "nps",
        "officer", "arrest", "terrorism", "bandit", "militia",
        "kidnap", "extrajudicial", "murder", "gang", "vigilante", "gsu",
    ],
    "Corruption": [
        "corruption", "bribery", "embezzlement", "scandal", "graft",
        "tender", "fraud", "looting", "impunity", "eacc", "odpp",
        "kickback", "ghost worker", "inflated", "siphon", "irregular",
    ],
    "Agriculture": [
        "farm", "agriculture", "crop", "fertilizer", "maize",
        "tea", "coffee", "livestock", "irrigation", "kari", "asal",
        "harvest", "drought", "food production", "horticulture", "dairy",
    ],
    "Youth Unemployment": [
        "unemployment", "youth", "jobs", "hustle", "hustler", "graduate",
        "intern", "neet", "jobless", "employment", "gen z",
        "tarmacking", "idle", "work permit", "casual", "jua kali",
    ],
    "Taxation & Revenue": [
        "tax", "revenue", "kra", "vat", "levy", "customs", "tariff",
        "budget", "exchequer", "treasury", "finance bill",
        "fuel levy", "sin tax", "withholding", "itax", "taxpayer",
    ],
    "Devolution": [
        "devolution", "county government", "governor", "mca",
        "cec", "equalization", "intergovernmental", "ward",
        "county assembly", "devolved", "county funds", "senator",
    ],
    "Food Security": [
        "hunger", "food", "famine", "malnutrition", "relief food",
        "wfp", "starving", "food insecurity", "food prices",
        "subsidized maize", "ration", "emergency food",
    ],
}


def detect_topics(text: str) -> list[str]:
    """Return list of canonical topic names found in text (may be multiple)."""
    text_lower = text.lower()
    matched = [
        topic
        for topic, keywords in _TOPIC_KEYWORDS.items()
        if any(kw in text_lower for kw in keywords)
    ]
    return matched

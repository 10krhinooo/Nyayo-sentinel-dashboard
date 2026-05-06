export interface TopicContext {
  description: string;
  keyAreas: string[];
}

export interface AlertStats {
  eventCount: number;
  negativeCount: number;
  negativePercent: number;
  avgScore: number | null;
  sources: Array<{ source: string; count: number }>;
}

export const TOPIC_CONTEXT: Record<string, TopicContext> = {
  "Healthcare": {
    description: "Monitors public sentiment on health service delivery, hospital conditions, medicine availability, and national health insurance access across Kenya.",
    keyAreas: [
      "Hospital & clinic conditions",
      "Drug & medicine availability",
      "NHIF / SHA insurance coverage",
      "Maternal & child health services",
      "Disease outbreak responses (malaria, HIV, cancer)",
    ],
  },
  "Education": {
    description: "Tracks grievances and discussions around school quality, fees, curriculum changes, and access to education from primary through tertiary level.",
    keyAreas: [
      "School fees & bursary access",
      "CBC curriculum implementation",
      "KCSE / KCPE examination irregularities",
      "Teacher shortages & strikes",
      "TVET & university enrolment barriers",
    ],
  },
  "Land & Housing": {
    description: "Monitors land ownership disputes, evictions, title deed issuance, and affordable housing delivery across counties.",
    keyAreas: [
      "Illegal evictions & demolitions",
      "Title deed issuance backlogs",
      "Land grabbing & encroachment",
      "Affordable housing programme delivery",
      "Squatter settlement regularisation",
    ],
  },
  "Water & Sanitation": {
    description: "Tracks complaints and events relating to water supply, sewerage infrastructure, drought impact, and sanitation access.",
    keyAreas: [
      "Water supply interruptions",
      "Borehole & pipeline infrastructure",
      "Flooding & drainage failures",
      "Toilet & latrine access",
      "Drought & water scarcity",
    ],
  },
  "Roads & Transport": {
    description: "Monitors road condition reports, infrastructure delays, public transport grievances, and major highway developments.",
    keyAreas: [
      "Potholes & impassable roads",
      "SGR & public transport services",
      "Bridge & flyover construction delays",
      "Traffic congestion in urban areas",
      "Rural road connectivity",
    ],
  },
  "Security & Police": {
    description: "Tracks crime incidents, police conduct, terrorism alerts, and community security conditions across counties.",
    keyAreas: [
      "Robbery, murder & violent crime",
      "Police misconduct & extrajudicial action",
      "Bandit & militia activity",
      "Terrorism & kidnapping reports",
      "Gang activity & vigilante incidents",
    ],
  },
  "Corruption": {
    description: "Monitors public sector bribery, embezzlement, tender irregularities, ghost workers, and procurement fraud across all levels of government.",
    keyAreas: [
      "Public bribery & kickbacks",
      "Tender & procurement fraud",
      "Embezzlement of public funds",
      "Ghost worker schemes",
      "EACC & ODPP investigations",
    ],
  },
  "Agriculture": {
    description: "Tracks farmer grievances, crop subsidies, fertilizer availability, irrigation programme delivery, and market access issues.",
    keyAreas: [
      "Fertilizer shortage & subsidy delivery",
      "Tea, coffee & horticulture sector issues",
      "Livestock disease & management",
      "Drought impact on harvests",
      "Irrigation scheme implementation",
    ],
  },
  "Youth Unemployment": {
    description: "Monitors youth job market sentiment, graduate employment barriers, internship access, and informal sector (jua kali) conditions.",
    keyAreas: [
      "Graduate unemployment (tarmacking)",
      "Internship & attachment programmes",
      "Hustler fund & informal sector support",
      "Gen Z economic concerns",
      "Work permit & casual labour conditions",
    ],
  },
  "Taxation & Revenue": {
    description: "Tracks public reaction to KRA enforcement, new tax proposals, finance bills, VAT changes, and government revenue collection.",
    keyAreas: [
      "KRA tax compliance & enforcement",
      "Finance Bill & budget proposals",
      "Fuel levy & VAT changes",
      "Sin tax & excise duty",
      "iTax system & taxpayer grievances",
    ],
  },
  "Devolution": {
    description: "Monitors county government performance, equalization funds, governor accountability, and intergovernmental relations.",
    keyAreas: [
      "County budget utilisation",
      "Governor & MCA accountability",
      "Equalization fund disbursement",
      "County assembly (CEC) transparency",
      "Ward development fund delivery",
    ],
  },
  "Food Security": {
    description: "Tracks hunger reports, famine early warnings, WFP relief food distribution, malnutrition, and food price volatility.",
    keyAreas: [
      "Famine & hunger reports",
      "WFP & relief food distribution",
      "Malnutrition in arid counties",
      "Subsidized maize & ration availability",
      "Food price spikes",
    ],
  },
};

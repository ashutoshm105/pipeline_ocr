"""Multi-system medical knowledge base for rule-based diagnosis."""

from typing import Dict, List, Tuple

# Each condition maps to a list of required lab patterns.
# A pattern is (lab_name, comparator, threshold).
# comparator: ">" (elevated), "<" (low), ">=" , "<="
# All patterns in a condition's list must match for the condition to fire.

CONDITION_PATTERNS: Dict[str, Dict] = {
    # =========================================================================
    # HEPATOLOGY PANEL
    # =========================================================================
    "Hepatocellular Injury": {
        "patterns": [
            ("ALT", ">", 40),
            ("AST", ">", 40),
        ],
        "description": (
            "Elevated transaminases indicating hepatocyte damage. "
            "Common causes include viral hepatitis, drug-induced liver injury, "
            "and metabolic liver disease."
        ),
        "severity_weights": {"ALT": 0.5, "AST": 0.5},
        "recommendations": [
            "Obtain viral hepatitis panel (HBsAg, anti-HCV)",
            "Review medication history for hepatotoxic agents",
            "Consider abdominal ultrasound",
            "Repeat LFTs in 2-4 weeks if mild elevation",
        ],
    },
    "Cholestasis": {
        "patterns": [
            ("ALP", ">", 120),
            ("GGT", ">", 60),
        ],
        "description": (
            "Elevated cholestatic enzymes suggesting bile flow obstruction "
            "or intrahepatic cholestasis."
        ),
        "severity_weights": {"ALP": 0.4, "GGT": 0.3, "Total Bilirubin": 0.3},
        "recommendations": [
            "Obtain abdominal ultrasound to evaluate bile ducts",
            "Check direct (conjugated) bilirubin fraction",
            "Consider MRCP if ultrasound inconclusive",
            "Evaluate for PBC (anti-mitochondrial antibodies) or PSC",
        ],
    },
    "Hepatic Failure": {
        "patterns": [
            ("Albumin", "<", 3.5),
            ("INR", ">", 1.5),
        ],
        "description": (
            "Reduced synthetic function indicating significant hepatic "
            "impairment. Low albumin and prolonged INR reflect decreased "
            "hepatic protein synthesis."
        ),
        "severity_weights": {"Albumin": 0.4, "INR": 0.4, "Total Bilirubin": 0.2},
        "recommendations": [
            "Urgent hepatology consultation",
            "Assess for encephalopathy (HE grading)",
            "Calculate MELD score for transplant evaluation",
            "Monitor coagulation parameters closely",
            "Avoid hepatotoxic medications",
        ],
    },
    "Obstructive Jaundice": {
        "patterns": [
            ("Total Bilirubin", ">", 2.0),
            ("Direct Bilirubin", ">", 1.0),
            ("ALP", ">", 120),
        ],
        "description": (
            "Conjugated hyperbilirubinemia with elevated ALP suggesting "
            "extrahepatic or intrahepatic obstruction."
        ),
        "severity_weights": {
            "Total Bilirubin": 0.4,
            "Direct Bilirubin": 0.3,
            "ALP": 0.3,
        },
        "recommendations": [
            "Urgent abdominal ultrasound to assess biliary dilation",
            "Consider CT abdomen or MRCP",
            "Evaluate for choledocholithiasis or pancreatic mass",
            "Gastroenterology/surgical consultation if obstruction confirmed",
        ],
    },
    "Hemolytic Jaundice": {
        "patterns": [
            ("Total Bilirubin", ">", 2.0),
            ("Direct Bilirubin", "<", 0.4),
        ],
        "description": (
            "Unconjugated hyperbilirubinemia suggesting hemolysis or "
            "impaired conjugation (e.g., Gilbert syndrome)."
        ),
        "severity_weights": {"Total Bilirubin": 0.5, "Direct Bilirubin": 0.2},
        "recommendations": [
            "Check reticulocyte count, LDH, and haptoglobin",
            "Obtain peripheral blood smear",
            "Direct Coombs test to evaluate for autoimmune hemolysis",
            "Consider Gilbert syndrome if mild and isolated",
        ],
    },
    "Cirrhosis Indicators": {
        "patterns": [
            ("Albumin", "<", 3.5),
            ("Platelet Count", "<", 150),
        ],
        "description": (
            "Low albumin with thrombocytopenia suggests portal hypertension "
            "and chronic liver disease progressing toward cirrhosis."
        ),
        "severity_weights": {
            "Albumin": 0.3,
            "Platelet Count": 0.3,
            "INR": 0.2,
            "Total Bilirubin": 0.2,
        },
        "recommendations": [
            "Obtain liver elastography (FibroScan) or shear wave elastography",
            "Screen for esophageal varices with upper endoscopy",
            "Calculate Child-Pugh and MELD scores",
            "Initiate HCC surveillance (ultrasound + AFP every 6 months)",
            "Assess for complications: ascites, SBP, HE",
        ],
    },
    "Wilson's Disease": {
        "patterns": [
            ("Ceruloplasmin", "<", 20),
            ("ALT", ">", 40),
        ],
        "description": (
            "Low ceruloplasmin with hepatocellular injury raises suspicion "
            "for Wilson's disease (hepatolenticular degeneration)."
        ),
        "severity_weights": {"Ceruloplasmin": 0.5, "ALT": 0.3, "AST": 0.2},
        "recommendations": [
            "Obtain 24-hour urine copper",
            "Slit-lamp examination for Kayser-Fleischer rings",
            "Consider liver biopsy with hepatic copper quantification",
            "Genetics consultation for ATP7B mutation analysis",
            "Initiate chelation therapy if confirmed (penicillamine or trientine)",
        ],
    },
    "Autoimmune Hepatitis": {
        "patterns": [
            ("ALT", ">", 40),
            ("IgG", ">", 1600),
        ],
        "description": (
            "Elevated transaminases with raised IgG suggesting autoimmune "
            "hepatitis. Requires serological confirmation."
        ),
        "severity_weights": {"ALT": 0.3, "AST": 0.2, "IgG": 0.3},
        "recommendations": [
            "Check ANA, ASMA (anti-smooth muscle antibody), anti-LKM-1",
            "Obtain liver biopsy for histological confirmation",
            "Calculate simplified AIH score",
            "Hepatology referral for immunosuppressive therapy",
        ],
    },
    "HCC Screening Positive": {
        "patterns": [
            ("AFP", ">", 20),
        ],
        "description": (
            "Elevated alpha-fetoprotein warrants further evaluation for "
            "hepatocellular carcinoma, especially in patients with known "
            "chronic liver disease."
        ),
        "severity_weights": {"AFP": 0.7},
        "recommendations": [
            "Obtain multiphasic CT or MRI of the liver (LI-RADS protocol)",
            "Correlate with clinical context (chronic HBV/HCV, cirrhosis)",
            "Consider AFP-L3 and DCP (PIVKA-II) for additional specificity",
            "Urgent hepatology/oncology referral if imaging suspicious",
        ],
    },
    # =========================================================================
    # RENAL PANEL
    # =========================================================================
    "Acute Kidney Injury": {
        "patterns": [
            ("Creatinine", ">", 1.5),
            ("BUN", ">", 25),
        ],
        "description": (
            "Elevated creatinine and BUN indicating acute decline in renal "
            "function. Requires prompt evaluation for prerenal, intrinsic, "
            "or postrenal etiologies."
        ),
        "severity_weights": {"Creatinine": 0.5, "BUN": 0.5},
        "recommendations": [
            "Assess volume status and hemodynamic stability",
            "Obtain urinalysis with microscopy for casts and cells",
            "Calculate BUN/Creatinine ratio to differentiate prerenal vs intrinsic",
            "Review nephrotoxic medications (NSAIDs, aminoglycosides, contrast)",
            "Consider renal ultrasound to exclude obstruction",
        ],
    },
    "Chronic Kidney Disease": {
        "patterns": [
            ("GFR", "<", 60),
            ("Creatinine", ">", 1.5),
        ],
        "description": (
            "Reduced glomerular filtration rate with elevated creatinine "
            "suggesting chronic kidney disease (stage 3 or higher). "
            "Requires staging and management of complications."
        ),
        "severity_weights": {"GFR": 0.6, "Creatinine": 0.4},
        "recommendations": [
            "Stage CKD using GFR and albuminuria (KDIGO classification)",
            "Check urine albumin-to-creatinine ratio (UACR)",
            "Monitor electrolytes, calcium, phosphorus, and PTH",
            "Adjust renally-cleared medication dosages",
            "Nephrology referral if GFR < 30 or rapidly declining",
        ],
    },
    "Nephrotic Syndrome": {
        "patterns": [
            ("Albumin", "<", 2.5),
            ("Total Protein", "<", 5.5),
        ],
        "description": (
            "Profound hypoalbuminemia and hypoproteinemia consistent with "
            "nephrotic-range proteinuria. Associated with edema, "
            "hyperlipidemia, and thrombotic risk."
        ),
        "severity_weights": {"Albumin": 0.5, "Total Protein": 0.5},
        "recommendations": [
            "Quantify proteinuria with 24-hour urine or spot UPCR",
            "Check lipid panel and assess for hyperlipidemia",
            "Evaluate for thromboembolic risk and consider prophylaxis",
            "Nephrology referral for renal biopsy consideration",
            "Assess and manage edema with sodium restriction and diuretics",
        ],
    },
    # =========================================================================
    # CBC / HEMATOLOGY PANEL
    # =========================================================================
    "Iron Deficiency Anemia": {
        "patterns": [
            ("Hemoglobin", "<", 12),
            ("MCV", "<", 80),
            ("Iron", "<", 60),
        ],
        "description": (
            "Microcytic anemia with low serum iron consistent with iron "
            "deficiency. Most common cause of anemia worldwide."
        ),
        "severity_weights": {"Hemoglobin": 0.4, "MCV": 0.3, "Iron": 0.3},
        "recommendations": [
            "Check ferritin, TIBC, and transferrin saturation",
            "Evaluate for sources of blood loss (GI, menstrual)",
            "Consider upper and lower GI endoscopy if no obvious source",
            "Initiate oral iron supplementation (ferrous sulfate 325 mg daily)",
            "Recheck CBC and iron studies in 4-6 weeks",
        ],
    },
    "Megaloblastic Anemia": {
        "patterns": [
            ("Hemoglobin", "<", 12),
            ("MCV", ">", 100),
        ],
        "description": (
            "Macrocytic anemia suggesting B12 or folate deficiency, "
            "or other causes of impaired DNA synthesis."
        ),
        "severity_weights": {"Hemoglobin": 0.5, "MCV": 0.5},
        "recommendations": [
            "Check serum vitamin B12 and folate levels",
            "Obtain methylmalonic acid and homocysteine if B12 borderline",
            "Review peripheral blood smear for hypersegmented neutrophils",
            "Evaluate for pernicious anemia (anti-intrinsic factor antibodies)",
            "Initiate appropriate supplementation based on deficiency identified",
        ],
    },
    "Leukocytosis": {
        "patterns": [
            ("WBC", ">", 11000),
        ],
        "description": (
            "Elevated white blood cell count indicating infection, "
            "inflammation, stress response, or hematologic malignancy."
        ),
        "severity_weights": {"WBC": 1.0},
        "recommendations": [
            "Obtain WBC differential to identify predominant cell type",
            "Evaluate for infectious source (cultures, imaging as indicated)",
            "Review medication history (corticosteroids, lithium, G-CSF)",
            "Consider peripheral blood smear if WBC markedly elevated",
        ],
    },
    "Leukopenia": {
        "patterns": [
            ("WBC", "<", 4000),
        ],
        "description": (
            "Low white blood cell count increasing susceptibility to "
            "infections. May indicate bone marrow suppression, viral "
            "infection, or autoimmune process."
        ),
        "severity_weights": {"WBC": 1.0},
        "recommendations": [
            "Obtain WBC differential with absolute neutrophil count (ANC)",
            "Review medications for myelosuppressive agents",
            "Check viral serologies (HIV, EBV, CMV, hepatitis)",
            "Consider hematology referral if persistent or ANC < 1000",
        ],
    },
    "Thrombocytopenia": {
        "patterns": [
            ("Platelet Count", "<", 150),
        ],
        "description": (
            "Low platelet count increasing bleeding risk. Etiologies "
            "include decreased production, increased destruction, or "
            "splenic sequestration."
        ),
        "severity_weights": {"Platelet Count": 1.0},
        "recommendations": [
            "Review peripheral blood smear to confirm true thrombocytopenia",
            "Evaluate for pseudothrombocytopenia (EDTA-induced clumping)",
            "Check for splenomegaly and signs of liver disease",
            "Assess for immune thrombocytopenia (ITP) or TTP/HUS if acute",
            "Hematology referral if platelets < 50 or active bleeding",
        ],
    },
    # =========================================================================
    # LIPID PANEL
    # =========================================================================
    "Dyslipidemia - Hypercholesterolemia": {
        "patterns": [
            ("Total Cholesterol", ">", 240),
        ],
        "description": (
            "Elevated total cholesterol increasing cardiovascular risk. "
            "Requires lipid fractionation and cardiovascular risk assessment."
        ),
        "severity_weights": {"Total Cholesterol": 1.0},
        "recommendations": [
            "Obtain fasting lipid panel with LDL, HDL, and triglycerides",
            "Calculate 10-year ASCVD risk score",
            "Initiate therapeutic lifestyle changes (diet, exercise)",
            "Consider statin therapy based on risk stratification",
            "Screen for secondary causes (hypothyroidism, nephrotic syndrome)",
        ],
    },
    "Dyslipidemia - Elevated LDL": {
        "patterns": [
            ("LDL", ">", 160),
        ],
        "description": (
            "Elevated LDL cholesterol, a primary driver of atherosclerotic "
            "cardiovascular disease."
        ),
        "severity_weights": {"LDL": 1.0},
        "recommendations": [
            "Assess ASCVD risk factors and calculate 10-year risk",
            "Initiate high-intensity statin if ASCVD risk elevated",
            "Recommend dietary modifications (reduce saturated fat intake)",
            "Recheck lipid panel 4-12 weeks after initiating therapy",
            "Consider ezetimibe or PCSK9 inhibitor if statin-insufficient",
        ],
    },
    "Hypertriglyceridemia": {
        "patterns": [
            ("Triglycerides", ">", 200),
        ],
        "description": (
            "Elevated triglycerides associated with cardiovascular risk "
            "and, when severely elevated (>500), risk of acute pancreatitis."
        ),
        "severity_weights": {"Triglycerides": 1.0},
        "recommendations": [
            "Evaluate for secondary causes (diabetes, alcohol, medications)",
            "Recommend dietary changes (reduce refined carbohydrates, alcohol)",
            "Initiate fibrate therapy if triglycerides > 500 (pancreatitis risk)",
            "Consider omega-3 fatty acids (icosapent ethyl) as adjunct",
        ],
    },
    "Metabolic Syndrome Indicators": {
        "patterns": [
            ("Triglycerides", ">", 150),
            ("Glucose", ">", 100),
        ],
        "description": (
            "Co-elevation of triglycerides and fasting glucose suggesting "
            "metabolic syndrome. Additional criteria include waist "
            "circumference, blood pressure, and low HDL."
        ),
        "severity_weights": {"Triglycerides": 0.5, "Glucose": 0.5},
        "recommendations": [
            "Assess full metabolic syndrome criteria (ATP III or IDF)",
            "Measure waist circumference and blood pressure",
            "Check HDL cholesterol (low HDL supports diagnosis)",
            "Initiate lifestyle intervention (weight loss, exercise, diet)",
            "Screen for type 2 diabetes with HbA1c",
        ],
    },
    # =========================================================================
    # THYROID PANEL
    # =========================================================================
    "Hypothyroidism": {
        "patterns": [
            ("TSH", ">", 4.5),
        ],
        "description": (
            "Elevated TSH indicating primary hypothyroidism or subclinical "
            "hypothyroidism. Most commonly due to Hashimoto thyroiditis."
        ),
        "severity_weights": {"TSH": 1.0},
        "recommendations": [
            "Check free T4 to distinguish overt from subclinical hypothyroidism",
            "Obtain anti-TPO antibodies to evaluate for Hashimoto thyroiditis",
            "Initiate levothyroxine replacement if overt hypothyroidism confirmed",
            "Recheck TSH 6-8 weeks after dose initiation or adjustment",
        ],
    },
    "Hyperthyroidism": {
        "patterns": [
            ("TSH", "<", 0.4),
        ],
        "description": (
            "Suppressed TSH indicating hyperthyroidism or thyrotoxicosis. "
            "Common causes include Graves disease, toxic nodular goiter, "
            "and thyroiditis."
        ),
        "severity_weights": {"TSH": 1.0},
        "recommendations": [
            "Check free T4 and free T3 to confirm and quantify thyrotoxicosis",
            "Obtain TSH receptor antibodies (TRAb) to evaluate for Graves disease",
            "Consider radioactive iodine uptake scan for etiology",
            "Assess for symptoms: tachycardia, tremor, weight loss, anxiety",
            "Endocrinology referral for definitive management",
        ],
    },
    # =========================================================================
    # DIABETES PANEL
    # =========================================================================
    "Diabetes Mellitus": {
        "patterns": [
            ("Glucose", ">", 126),
        ],
        "description": (
            "Fasting glucose above diagnostic threshold for diabetes mellitus. "
            "Requires confirmation with repeat testing or HbA1c."
        ),
        "severity_weights": {"Glucose": 0.5, "HbA1c": 0.5},
        "recommendations": [
            "Confirm with repeat fasting glucose or HbA1c",
            "Obtain HbA1c for glycemic baseline and monitoring",
            "Initiate lifestyle modifications (diet, exercise, weight management)",
            "Consider metformin as first-line pharmacotherapy",
            "Screen for complications: retinopathy, nephropathy, neuropathy",
        ],
    },
    "Diabetes Mellitus (HbA1c)": {
        "patterns": [
            ("HbA1c", ">", 6.5),
        ],
        "description": (
            "HbA1c above diagnostic threshold confirming diabetes mellitus. "
            "Reflects average glycemia over the preceding 2-3 months."
        ),
        "severity_weights": {"HbA1c": 1.0},
        "recommendations": [
            "Set individualized HbA1c target (typically < 7% for most adults)",
            "Initiate or intensify glucose-lowering therapy",
            "Order comprehensive metabolic panel and lipid panel",
            "Schedule ophthalmology referral for diabetic retinopathy screening",
            "Educate on self-monitoring of blood glucose and hypoglycemia awareness",
        ],
    },
    "Pre-diabetes": {
        "patterns": [
            ("Glucose", ">", 100),
            ("Glucose", "<", 126),
        ],
        "description": (
            "Impaired fasting glucose (100-125 mg/dL) indicating increased "
            "risk for progression to type 2 diabetes mellitus."
        ),
        "severity_weights": {"Glucose": 1.0},
        "recommendations": [
            "Obtain HbA1c to assess glycemic status (pre-diabetes: 5.7-6.4%)",
            "Initiate intensive lifestyle intervention (weight loss 5-7%)",
            "Recommend 150 minutes/week of moderate physical activity",
            "Recheck fasting glucose and HbA1c annually",
            "Consider metformin if high-risk (BMI >= 35, age < 60, prior GDM)",
        ],
    },
    # =========================================================================
    # CARDIAC PANEL
    # =========================================================================
    "Cardiac Injury": {
        "patterns": [
            ("Troponin", ">", 0.04),
        ],
        "description": (
            "Elevated troponin indicating myocardial injury. Requires "
            "urgent evaluation for acute coronary syndrome, myocarditis, "
            "or other causes of cardiac damage."
        ),
        "severity_weights": {"Troponin": 1.0},
        "recommendations": [
            "Obtain serial troponin measurements (0, 3, 6 hours)",
            "Perform 12-lead ECG and compare with prior tracings",
            "Assess for chest pain, dyspnea, and hemodynamic instability",
            "Cardiology consultation for risk stratification",
            "Consider coronary angiography if ACS suspected",
        ],
    },
    "Heart Failure Markers": {
        "patterns": [
            ("BNP", ">", 100),
        ],
        "description": (
            "Elevated BNP (brain natriuretic peptide) suggesting "
            "ventricular wall stress consistent with heart failure."
        ),
        "severity_weights": {"BNP": 1.0},
        "recommendations": [
            "Obtain echocardiogram to assess ejection fraction and structure",
            "Evaluate for volume overload (JVD, edema, pulmonary congestion)",
            "Check renal function and electrolytes before initiating diuretics",
            "Cardiology referral for classification and guideline-directed therapy",
            "Consider NT-proBNP for serial monitoring if available",
        ],
    },
    # =========================================================================
    # ELECTROLYTE PANEL
    # =========================================================================
    "Hyperkalemia": {
        "patterns": [
            ("Potassium", ">", 5.0),
        ],
        "description": (
            "Elevated serum potassium posing risk for cardiac arrhythmias. "
            "Urgent evaluation required, especially if > 6.0 mEq/L."
        ),
        "severity_weights": {"Potassium": 1.0},
        "recommendations": [
            "Obtain stat ECG to assess for peaked T waves or conduction changes",
            "Rule out pseudohyperkalemia (hemolyzed sample, tourniquet artifact)",
            "Review medications (ACE inhibitors, ARBs, K-sparing diuretics)",
            "Administer calcium gluconate if ECG changes present (cardioprotection)",
            "Initiate potassium-lowering therapy (insulin/dextrose, kayexalate, or patiromer)",
        ],
    },
    "Hypokalemia": {
        "patterns": [
            ("Potassium", "<", 3.5),
        ],
        "description": (
            "Low serum potassium risking muscle weakness, cardiac "
            "arrhythmias, and ileus. Common with diuretic use, GI losses, "
            "or inadequate intake."
        ),
        "severity_weights": {"Potassium": 1.0},
        "recommendations": [
            "Obtain ECG to assess for U waves, ST depression, or arrhythmias",
            "Check magnesium level (hypomagnesemia impairs K correction)",
            "Review medications (loop/thiazide diuretics, laxatives)",
            "Initiate potassium replacement (oral if > 3.0, IV if < 3.0 or symptomatic)",
            "Monitor potassium levels during replacement therapy",
        ],
    },
    "Hypernatremia": {
        "patterns": [
            ("Sodium", ">", 145),
        ],
        "description": (
            "Elevated serum sodium indicating free water deficit. "
            "Common in dehydration, diabetes insipidus, or impaired thirst."
        ),
        "severity_weights": {"Sodium": 1.0},
        "recommendations": [
            "Assess volume status and oral fluid intake",
            "Calculate free water deficit to guide replacement",
            "Correct slowly (no more than 10 mEq/L per 24 hours to avoid cerebral edema)",
            "Evaluate for diabetes insipidus if polyuric (check urine osmolality)",
            "Monitor sodium every 4-6 hours during correction",
        ],
    },
    "Hyponatremia": {
        "patterns": [
            ("Sodium", "<", 135),
        ],
        "description": (
            "Low serum sodium, the most common electrolyte disorder. "
            "Can cause neurological symptoms ranging from confusion to seizures."
        ),
        "severity_weights": {"Sodium": 1.0},
        "recommendations": [
            "Check serum and urine osmolality to classify hyponatremia",
            "Assess volume status (hypovolemic, euvolemic, hypervolemic)",
            "Review medications (thiazides, SSRIs, desmopressin)",
            "Correct slowly (no more than 8 mEq/L per 24 hours to prevent osmotic demyelination)",
            "Consider SIADH workup if euvolemic hypotonic hyponatremia",
        ],
    },
    "Hypercalcemia": {
        "patterns": [
            ("Calcium", ">", 10.5),
        ],
        "description": (
            "Elevated serum calcium. Most common causes are primary "
            "hyperparathyroidism and malignancy. Can cause renal stones, "
            "bone loss, and neuropsychiatric symptoms."
        ),
        "severity_weights": {"Calcium": 1.0},
        "recommendations": [
            "Check intact PTH to differentiate PTH-mediated from non-PTH-mediated causes",
            "Obtain ionized calcium or correct for albumin level",
            "Check vitamin D levels (25-OH and 1,25-dihydroxy)",
            "Hydrate aggressively with IV normal saline if symptomatic or Ca > 12",
            "Evaluate for malignancy if PTH is suppressed (PTHrP, imaging)",
        ],
    },
    "Hypocalcemia": {
        "patterns": [
            ("Calcium", "<", 8.5),
        ],
        "description": (
            "Low serum calcium which can cause neuromuscular irritability, "
            "tetany, seizures, and prolonged QT interval."
        ),
        "severity_weights": {"Calcium": 1.0},
        "recommendations": [
            "Correct calcium for albumin level or check ionized calcium",
            "Check magnesium level (hypomagnesemia impairs PTH secretion)",
            "Obtain PTH, phosphorus, and vitamin D levels",
            "Administer IV calcium gluconate if symptomatic or severely low",
            "Obtain ECG to assess QT interval prolongation",
        ],
    },
}


ABBREVIATIONS: Dict[str, str] = {
    # Hepatology
    "NAFLD": "Non-Alcoholic Fatty Liver Disease",
    "NASH": "Non-Alcoholic Steatohepatitis",
    "CLD": "Chronic Liver Disease",
    "LC": "Liver Cirrhosis",
    "HCC": "Hepatocellular Carcinoma",
    "PBC": "Primary Biliary Cholangitis",
    "PSC": "Primary Sclerosing Cholangitis",
    "AIH": "Autoimmune Hepatitis",
    "HBV": "Hepatitis B Virus",
    "HCV": "Hepatitis C Virus",
    "MELD": "Model for End-Stage Liver Disease",
    "CP": "Child-Pugh (score/classification)",
    "HE": "Hepatic Encephalopathy",
    "SBP": "Spontaneous Bacterial Peritonitis",
    "TIPS": "Transjugular Intrahepatic Portosystemic Shunt",
    # Renal
    "AKI": "Acute Kidney Injury",
    "CKD": "Chronic Kidney Disease",
    "GFR": "Glomerular Filtration Rate",
    "BUN": "Blood Urea Nitrogen",
    "UACR": "Urine Albumin-to-Creatinine Ratio",
    "UPCR": "Urine Protein-to-Creatinine Ratio",
    "KDIGO": "Kidney Disease: Improving Global Outcomes",
    # Hematology
    "CBC": "Complete Blood Count",
    "MCV": "Mean Corpuscular Volume",
    "ANC": "Absolute Neutrophil Count",
    "TIBC": "Total Iron-Binding Capacity",
    "ITP": "Immune Thrombocytopenia",
    "TTP": "Thrombotic Thrombocytopenic Purpura",
    "HUS": "Hemolytic Uremic Syndrome",
    "LDH": "Lactate Dehydrogenase",
    "WBC": "White Blood Cell Count",
    "RBC": "Red Blood Cell Count",
    # Lipids
    "LDL": "Low-Density Lipoprotein",
    "HDL": "High-Density Lipoprotein",
    "ASCVD": "Atherosclerotic Cardiovascular Disease",
    "PCSK9": "Proprotein Convertase Subtilisin/Kexin Type 9",
    # Thyroid
    "TSH": "Thyroid-Stimulating Hormone",
    "TPO": "Thyroid Peroxidase",
    "TRAb": "TSH Receptor Antibodies",
    # Diabetes
    "HbA1c": "Hemoglobin A1c (Glycated Hemoglobin)",
    "GDM": "Gestational Diabetes Mellitus",
    "FPG": "Fasting Plasma Glucose",
    "OGTT": "Oral Glucose Tolerance Test",
    # Cardiac
    "ACS": "Acute Coronary Syndrome",
    "BNP": "Brain Natriuretic Peptide",
    "NT-proBNP": "N-Terminal pro-Brain Natriuretic Peptide",
    "ECG": "Electrocardiogram",
    "EF": "Ejection Fraction",
    "JVD": "Jugular Venous Distention",
    # Electrolytes
    "SIADH": "Syndrome of Inappropriate Antidiuretic Hormone",
    "PTH": "Parathyroid Hormone",
    "PTHrP": "Parathyroid Hormone-Related Peptide",
}


# Reference ranges used for severity calculation
REFERENCE_RANGES: Dict[str, Tuple[float, float]] = {
    # Hepatology
    "ALT": (7, 40),
    "AST": (10, 40),
    "ALP": (44, 120),
    "GGT": (9, 60),
    "Total Bilirubin": (0.1, 1.2),
    "Direct Bilirubin": (0.0, 0.3),
    "Albumin": (3.5, 5.0),
    "INR": (0.8, 1.1),
    "Ceruloplasmin": (20, 40),
    "IgG": (700, 1600),
    "AFP": (0, 10),
    # Renal
    "Creatinine": (0.6, 1.2),
    "BUN": (7, 25),
    "GFR": (90, 120),
    "Total Protein": (6.0, 8.3),
    # Hematology
    "Hemoglobin": (12.0, 17.5),
    "MCV": (80, 100),
    "Iron": (60, 170),
    "WBC": (4000, 11000),
    "Platelet Count": (150, 400),
    "Ferritin": (12, 300),
    # Lipids
    "Total Cholesterol": (0, 200),
    "LDL": (0, 100),
    "HDL": (40, 100),
    "Triglycerides": (0, 150),
    # Thyroid
    "TSH": (0.4, 4.5),
    "Free T4": (0.8, 1.8),
    "Free T3": (2.3, 4.2),
    # Diabetes
    "Glucose": (70, 100),
    "HbA1c": (4.0, 5.6),
    # Cardiac
    "Troponin": (0.0, 0.04),
    "BNP": (0, 100),
    "NT-proBNP": (0, 125),
    # Electrolytes
    "Potassium": (3.5, 5.0),
    "Sodium": (135, 145),
    "Calcium": (8.5, 10.5),
    "Magnesium": (1.7, 2.2),
    "Phosphorus": (2.5, 4.5),
    "Chloride": (96, 106),
    "Bicarbonate": (22, 29),
}

import spacy

# Load pre-trained spaCy model
nlp = spacy.load("en_core_web_sm")

# Description
description = "BW002\n398 Liquichek Urine Chemistry Control, Level 2\nSupplier must provide Certificate of Analysis or other\nCertificate certifying date of manufacture with every\nshipment or every lot. Such documents must be\nincluded in the goods upon receipt at Buyer's delivery\naddress or sent to the buyer in advance with\nmatching part purchase order and shipment dates."

# Process the text
doc = nlp(description)

# Extract named entities
for ent in doc.ents:
    print(f"{ent.text}: {ent.label_}")

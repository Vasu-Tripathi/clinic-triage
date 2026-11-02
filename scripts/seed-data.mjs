// Seed data for the triage clinic (fictional people; Bengaluru branches).
export const branches = [
  { name: 'Koramangala Clinic', street: '80 Feet Road, 4th Block, Koramangala', pincode: '560034', phone: '+918041234501', opens: '08:00', closes: '20:00' },
  { name: 'Jayanagar Clinic',   street: '11th Main Road, 4th Block, Jayanagar',  pincode: '560011', phone: '+918041234502', opens: '08:00', closes: '20:00' },
  { name: 'Whitefield Clinic',  street: 'ITPL Main Road, Whitefield',            pincode: '560066', phone: '+918041234503', opens: '09:00', closes: '21:00' },
];

export const specializations = [
  ['General Medicine', 'Primary care physician for common illnesses: fever, cold, cough, flu, body ache, fatigue, infections, general check-ups and first point of contact when unsure.'],
  ['Cardiology', 'Heart and blood vessel disorders: chest pain or tightness, palpitations, racing or irregular heartbeat, high blood pressure, breathlessness on exertion, swelling of ankles.'],
  ['Dermatology', 'Skin, hair and nail problems: rashes, itching, acne, pimples, eczema, psoriasis, fungal infections, hair fall, dandruff, pigmentation, moles.'],
  ['Gastroenterology', 'Digestive system: stomach ache, acidity, heartburn, bloating, gas, vomiting, diarrhoea, constipation, blood in stool, liver and gallbladder problems, jaundice.'],
  ['Neurology', 'Brain and nerves: headaches and migraine, dizziness, seizures or fits, numbness or tingling, weakness of limbs, memory problems, tremors, stroke symptoms.'],
  ['Orthopedics', 'Bones, joints and muscles: back pain, neck pain, knee pain, joint swelling, fractures, sprains, sports injuries, arthritis, shoulder stiffness.'],
  ['ENT', 'Ear, nose and throat: ear pain, hearing loss, ringing in ears, blocked nose, sinusitis, nosebleeds, sore throat, tonsils, hoarse voice, snoring.'],
  ['Ophthalmology', 'Eyes and vision: blurry vision, red or watery eyes, eye pain, itching eyes, cataract, glaucoma, spectacles, floaters, dry eyes.'],
  ['Pulmonology', 'Lungs and breathing: chronic cough, wheezing, asthma, shortness of breath, COPD, tuberculosis, sleep apnea, chest infections.'],
  ['Psychiatry', 'Mental health: anxiety, panic attacks, low mood, depression, stress, sleep problems, insomnia, mood swings, addiction, concentration issues.'],
  ['Endocrinology', 'Hormones and metabolism: diabetes, high blood sugar, thyroid problems, unexplained weight gain or loss, excessive thirst, PCOS hormones, fatigue from hormonal causes.'],
  ['Urology', 'Urinary tract and male reproductive health: burning urination, frequent urination, kidney stones, blood in urine, prostate problems, flank pain.'],
  ['Gynecology', 'Women\'s reproductive health: irregular periods, menstrual cramps, heavy bleeding, pregnancy care, PCOS, vaginal discharge, menopause symptoms, pelvic pain.'],
  ['Pediatrics', 'Children and infants: fever in children, vaccinations, growth and development, childhood infections, feeding problems, child cough and cold.'],
];

// [name, specialization, branch index, license, years, fee, slot, notes]
export const doctors = [
  ['Dr. Ananya Rao', 'General Medicine', 0, 'KMC-10231', 12, 500, 15, 'Family physician who sees adults with fever, viral infections, cough and cold, body pain, tiredness, weakness, dengue and typhoid follow-up, routine health check-ups and lifestyle advice. Refers onward when a specialist is needed.'],
  ['Dr. Karthik Menon', 'General Medicine', 2, 'KMC-10544', 7, 450, 15, 'General practitioner for seasonal flu, sore throat with fever, mild infections, vomiting with fever, minor injuries, blood pressure checks and annual physicals for working professionals.'],
  ['Dr. Vikram Shetty', 'Cardiology', 0, 'KMC-11872', 18, 1200, 20, 'Interventional cardiologist treating chest pain, angina, heart attack follow-up, palpitations, fast or irregular heartbeat (arrhythmia), high blood pressure and breathlessness when climbing stairs.'],
  ['Dr. Meera Iyer', 'Cardiology', 1, 'KMC-12003', 14, 1100, 20, 'Clinical cardiologist focused on hypertension, heart failure, swelling in the legs, chest discomfort on exertion, cholesterol management and ECG / echo evaluation.'],
  ['Dr. Priya Nair', 'Dermatology', 1, 'KMC-12190', 9, 700, 15, 'Dermatologist for itchy rashes, red patches, eczema, psoriasis, hives, acne and pimples, fungal ringworm infections, pigmentation and allergic skin reactions.'],
  ['Dr. Rohan Kulkarni', 'Dermatology', 2, 'KMC-12457', 6, 650, 15, 'Skin and hair specialist: hair fall and thinning, dandruff, scalp itching, acne scars, warts, moles, nail fungus and cosmetic dermatology.'],
  ['Dr. Sanjay Gupta', 'Gastroenterology', 0, 'KMC-13010', 16, 1000, 20, 'Gastroenterologist for stomach pain, acidity and heartburn, gastritis, bloating after meals, nausea, vomiting, loose motions, constipation, IBS and endoscopy.'],
  ['Dr. Lakshmi Prasad', 'Gastroenterology', 2, 'KMC-13088', 11, 950, 20, 'Hepatology and digestive care: jaundice, yellow eyes, fatty liver, gallstones, pain in upper right abdomen, blood in stool, acid reflux and chronic diarrhoea.'],
  ['Dr. Arjun Bhat', 'Neurology', 1, 'KMC-13544', 15, 1200, 30, 'Neurologist treating migraine and severe headaches, dizziness and vertigo, seizures, numbness and tingling in hands or feet, nerve pain, tremors and Parkinson\'s disease.'],
  ['Dr. Kavya Reddy', 'Neurology', 0, 'KMC-13602', 8, 1000, 30, 'Neurology clinic for stroke recovery, sudden weakness, memory loss, fainting spells, epilepsy management and long-standing headaches.'],
  ['Dr. Rahul Deshpande', 'Orthopedics', 0, 'KMC-14021', 13, 800, 20, 'Orthopedic surgeon for knee pain, ligament tears, sports injuries, fractures, sprained ankle, shoulder dislocation and joint replacement.'],
  ['Dr. Sneha Joshi', 'Orthopedics', 1, 'KMC-14099', 10, 750, 20, 'Spine and joint specialist: lower back pain, slipped disc, sciatica pain radiating down the leg, neck stiffness, arthritis and osteoporosis.'],
  ['Dr. Naveen Hegde', 'ENT', 2, 'KMC-14512', 12, 700, 15, 'ENT surgeon for ear pain and discharge, hearing loss, ringing in the ears, blocked nose, sinus headache, nose bleeding, tonsillitis, throat pain and snoring.'],
  ['Dr. Divya Krishnan', 'ENT', 0, 'KMC-14577', 7, 650, 15, 'Otolaryngologist for sore throat, hoarseness and voice loss, difficulty swallowing, allergic rhinitis, sneezing, and ear wax blockage.'],
  ['Dr. Suresh Pillai', 'Ophthalmology', 1, 'KMC-15030', 20, 800, 15, 'Eye specialist for blurred or reduced vision, cataract, glaucoma, red painful eyes, eye infections, conjunctivitis, floaters and diabetic eye check-ups.'],
  ['Dr. Fatima Sheikh', 'Pulmonology', 2, 'KMC-15488', 11, 900, 20, 'Chest physician for persistent cough, wheezing, asthma, shortness of breath, COPD, pneumonia follow-up, tuberculosis and sleep apnea with loud snoring.'],
  ['Dr. Aditya Verma', 'Psychiatry', 1, 'KMC-16001', 9, 1000, 45, 'Psychiatrist helping with anxiety, panic attacks, constant worry, depression, low mood, loss of interest, insomnia and stress related to work or studies.'],
  ['Dr. Nisha Kapoor', 'Psychiatry', 2, 'KMC-16077', 6, 900, 45, 'Mental health clinic for mood swings, burnout, sleep problems, attention and concentration difficulty, OCD and substance use concerns.'],
  ['Dr. Ramesh Babu', 'Endocrinology', 0, 'KMC-16540', 17, 1000, 20, 'Endocrinologist managing diabetes, high sugar levels, excessive thirst and frequent urination, thyroid disorders, goitre, sudden weight gain or loss.'],
  ['Dr. Pooja Malhotra', 'Gynecology', 1, 'KMC-17020', 12, 900, 20, 'Gynecologist for irregular or missed periods, painful menstrual cramps, heavy bleeding, PCOS, pregnancy and antenatal care, pelvic pain and menopause.'],
  ['Dr. Harish Gowda', 'Urology', 2, 'KMC-17501', 14, 900, 20, 'Urologist for kidney stones, severe flank pain, burning while passing urine, urinary infections, blood in urine and prostate enlargement.'],
  ['Dr. Shalini Murthy', 'Pediatrics', 0, 'KMC-18012', 10, 600, 15, 'Pediatrician for babies and children: fever in kids, vaccinations, cough and cold in children, ear infections in children, growth monitoring and feeding issues.'],
];

// [name, email, dob, gender, blood, phone]
export const patients = [
  ['Arnav Reddy',    'arnav@demo.clinic',   '2005-03-14', 'male',   'B+',  '+919900001111'],
  ['Aisha Khan',     'aisha@demo.clinic',  '1992-07-21', 'female', 'O+',  '+919900002222'],
  ['Rahul Sharma',   'rahul@demo.clinic',  '1985-11-02', 'male',   'A+',  '+919900003333'],
  ['Deepa Srinivas', 'deepa@demo.clinic',  '1978-01-30', 'female', 'AB+', '+919900004444'],
  ['Manoj Kumar',    'manoj@demo.clinic',  '1966-05-09', 'male',   'O-',  '+919900005555'],
  ['Sara Thomas',    'sara@demo.clinic',   '2000-09-17', 'female', 'B-',  '+919900006666'],
  ['Imran Ali',      'imran@demo.clinic',  '1995-12-25', 'male',   'A-',  '+919900007777'],
  ['Neha Agarwal',   'neha@demo.clinic',   '1989-04-11', 'female', 'O+',  '+919900008888'],
];

// historical / upcoming symptom reports used to build appointments
// [patient idx, text, severity, days, doctor name, dayOffset, status]
export const history = [
  [1, 'Itchy red rash spreading on both arms for a week, worse at night', 5, 7, 'Dr. Priya Nair', -20, 'completed'],
  [2, 'Burning pain in upper stomach after meals and sour burps', 6, 14, 'Dr. Sanjay Gupta', -18, 'completed'],
  [3, 'Pounding headache on one side with nausea and sensitivity to light', 7, 3, 'Dr. Arjun Bhat', -15, 'completed'],
  [4, 'Heart racing suddenly while resting and feeling breathless', 8, 2, 'Dr. Vikram Shetty', -12, 'completed'],
  [5, 'Lower back pain shooting down my left leg when I sit for long', 6, 30, 'Dr. Sneha Joshi', -10, 'completed'],
  [6, 'Cannot sleep, constant worry about exams and heart pounding', 5, 21, 'Dr. Aditya Verma', -9, 'completed'],
  [7, 'Very thirsty all the time, peeing a lot and losing weight', 6, 30, 'Dr. Ramesh Babu', -7, 'completed'],
  [0, 'Blocked nose, pressure around cheeks and forehead, thick mucus', 4, 6, 'Dr. Naveen Hegde', -5, 'completed'],
  [1, 'Fever with body ache and sore throat since two days', 5, 2, 'Dr. Ananya Rao', -3, 'cancelled'],
  [2, 'Knee swollen and painful after football, cannot bend fully', 6, 4, 'Dr. Rahul Deshpande', 1, 'booked'],
  [3, 'Periods irregular for the last four months with severe cramps', 5, 120, 'Dr. Pooja Malhotra', 1, 'booked'],
  [4, 'Wheezing and shortness of breath at night, dry cough', 6, 10, 'Dr. Fatima Sheikh', 2, 'booked'],
  [0, 'Hair falling a lot and itchy flaky scalp', 3, 60, 'Dr. Rohan Kulkarni', 2, 'booked'],
  [5, 'Blurry vision when reading and eyes feel strained', 4, 45, 'Dr. Suresh Pillai', 3, 'booked'],
  [6, 'Sharp pain in my side going to groin, burning urine', 8, 1, 'Dr. Harish Gowda', 1, 'booked'],
  [7, 'Child has high fever and is not eating well', 7, 2, 'Dr. Shalini Murthy', 2, 'booked'],
];

export const prescriptionsByDoctor = {
  'Dr. Priya Nair':     ['Allergic contact dermatitis', 'Avoid new soaps; keep skin moisturised.', [['Cetirizine 10 mg', '1 tab', 'Once at night', 7], ['Mometasone 0.1% cream', 'Thin layer', 'Twice daily', 10]]],
  'Dr. Sanjay Gupta':   ['Gastritis / GERD', 'Small frequent meals, avoid spicy food and late dinners.', [['Pantoprazole 40 mg', '1 tab', 'Before breakfast', 14], ['Antacid gel', '10 ml', 'After meals', 7]]],
  'Dr. Arjun Bhat':     ['Migraine without aura', 'Maintain a headache diary; regular sleep.', [['Naproxen 500 mg', '1 tab', 'At onset, max twice daily', 5]]],
  'Dr. Vikram Shetty':  ['Paroxysmal supraventricular tachycardia (suspected)', 'Holter monitoring advised; avoid caffeine.', [['Metoprolol 25 mg', '1 tab', 'Twice daily', 30]]],
  'Dr. Sneha Joshi':    ['Lumbar radiculopathy (sciatica)', 'Physiotherapy 3x/week; avoid lifting.', [['Pregabalin 75 mg', '1 cap', 'At night', 14], ['Aceclofenac 100 mg', '1 tab', 'Twice daily after food', 5]]],
  'Dr. Aditya Verma':   ['Generalised anxiety with insomnia', 'Sleep hygiene; CBT sessions weekly.', [['Escitalopram 5 mg', '1 tab', 'Morning', 30]]],
  'Dr. Ramesh Babu':    ['Type 2 diabetes mellitus (new)', 'Diet consult; HbA1c after 3 months.', [['Metformin 500 mg', '1 tab', 'Twice daily with food', 90]]],
  'Dr. Naveen Hegde':   ['Acute sinusitis', 'Steam inhalation twice daily.', [['Amoxicillin-Clavulanate 625 mg', '1 tab', 'Twice daily', 7], ['Saline nasal spray', '2 sprays', 'Thrice daily', 7]]],
};

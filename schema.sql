-- Subcontractors table
CREATE TABLE IF NOT EXISTS subcontractors (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20) NOT NULL,
  business_name VARCHAR(255) NOT NULL,
  abn VARCHAR(20),
  business_address TEXT,
  bsb VARCHAR(7) NOT NULL,
  account_number VARCHAR(20) NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insurance documents table  
CREATE TABLE IF NOT EXISTS insurance_documents (
  id SERIAL PRIMARY KEY,
  subcontractor_id INTEGER REFERENCES subcontractors(id) ON DELETE CASCADE,
  document_type VARCHAR(100) NOT NULL, -- 'public_liability', 'workers_comp', 'other'
  expiry_date DATE,
  policy_number VARCHAR(100),
  insurer_name VARCHAR(255),
  extraction_confidence DECIMAL(3,2), -- 0.00 to 1.00
  extraction_error TEXT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reminded_at TIMESTAMP -- Track when reminder was sent
);

-- Index for efficient expiry date queries
CREATE INDEX IF NOT EXISTS idx_insurance_expiry ON insurance_documents(expiry_date);
CREATE INDEX IF NOT EXISTS idx_subcontractor_email ON subcontractors(email);

-- Employees table (new-employee-form submissions)
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20) NOT NULL,
  street_address TEXT NOT NULL,
  suburb VARCHAR(100) NOT NULL,
  state VARCHAR(10) NOT NULL,
  postcode VARCHAR(10) NOT NULL,
  emergency_name VARCHAR(255) NOT NULL,
  emergency_relationship VARCHAR(100) NOT NULL,
  emergency_phone VARCHAR(20) NOT NULL,
  position VARCHAR(255) NOT NULL,
  employment_type VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  tfn VARCHAR(11) NOT NULL,
  tax_free_threshold BOOLEAN DEFAULT FALSE,
  australian_resident BOOLEAN DEFAULT FALSE,
  has_help_debt BOOLEAN DEFAULT FALSE,
  super_fund_name VARCHAR(255),
  super_member_number VARCHAR(100),
  super_usi VARCHAR(50),
  bsb VARCHAR(7) NOT NULL,
  account_number VARCHAR(20) NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Employee documents table (Photo ID, White Card, other certs)
CREATE TABLE IF NOT EXISTS employee_documents (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  document_type VARCHAR(100) NOT NULL, -- 'photo_id', 'white_card', 'other'
  filename VARCHAR(500),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employee_email ON employees(email);
CREATE INDEX IF NOT EXISTS idx_employee_documents_employee ON employee_documents(employee_id);

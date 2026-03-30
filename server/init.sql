-- BİLGESİS TEKLİF - Docker Init SQL

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'personel',
    email VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (id, name, username, password, role, email)
VALUES ('admin1', 'Yönetici', 'admin', 'admin123', 'admin', '')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS customers (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(300) NOT NULL,
    contact_person VARCHAR(200),
    phone VARCHAR(50),
    email VARCHAR(200),
    fax VARCHAR(50),
    tax_office VARCHAR(200),
    tax_number VARCHAR(50),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proposals (
    id VARCHAR(50) PRIMARY KEY,
    proposal_no VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'taslak',
    customer_name VARCHAR(300) NOT NULL,
    contact_person VARCHAR(200),
    customer_phone VARCHAR(50),
    customer_email VARCHAR(200),
    customer_fax VARCHAR(50),
    customer_address TEXT,
    tax_office VARCHAR(200),
    tax_number VARCHAR(50),
    delivery_date VARCHAR(100),
    order_no VARCHAR(100),
    date DATE,
    currency VARCHAR(10) DEFAULT 'USD',
    kdv_rate NUMERIC(5,2) DEFAULT 20,
    payment_plan VARCHAR(100),
    reminder_date DATE,
    items JSONB DEFAULT '[]',
    discount NUMERIC(15,2) DEFAULT 0,
    subtotal NUMERIC(15,2) DEFAULT 0,
    discounted_subtotal NUMERIC(15,2) DEFAULT 0,
    kdv NUMERIC(15,2) DEFAULT 0,
    grand_total NUMERIC(15,2) DEFAULT 0,
    additional_services TEXT,
    notes TEXT,
    sales_rep VARCHAR(200),
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    call_logs JSONB DEFAULT '[]',
    reminder_completed BOOLEAN DEFAULT FALSE,
    accept_token VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(300) NOT NULL,
    price NUMERIC(15,2) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'USD',
    category VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB
);

CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_created_by ON proposals(created_by);
CREATE INDEX IF NOT EXISTS idx_proposals_customer_name ON proposals(customer_name);
CREATE INDEX IF NOT EXISTS idx_proposals_reminder_date ON proposals(reminder_date);
CREATE INDEX IF NOT EXISTS idx_proposals_date ON proposals(date);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

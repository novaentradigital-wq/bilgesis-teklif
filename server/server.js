/* ============================================
   BİLGESİS TEKLİF YÖNETİM SİSTEMİ
   Node.js + Express + PostgreSQL Backend
   ============================================ */

// .env dosyasını oku
const fs = require('fs');
const envPath = require('path').join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const [key, ...val] = line.split('=');
        if (key && val.length) process.env[key.trim()] = val.join('=').trim();
    });
}

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL bağlantısı
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'bilgesis_teklif',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Statik dosyalar (frontend) - hem lokal hem Docker uyumlu
const frontendPath = fs.existsSync(path.join(__dirname, 'uygulama'))
    ? path.join(__dirname, 'uygulama')
    : path.join(__dirname, '..', 'uygulama');
app.use(express.static(frontendPath));

// ============ AUTH ============
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await pool.query(
            'SELECT id, name, username, role, email FROM users WHERE username = $1 AND password = $2',
            [username, password]
        );
        if (result.rows.length > 0) {
            res.json({ success: true, user: result.rows[0] });
        } else {
            res.json({ success: false, message: 'Kullanıcı adı veya şifre hatalı!' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============ USERS ============
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, username, role, email FROM users ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const { id, name, username, password, role, email } = req.body;
        await pool.query(
            'INSERT INTO users (id, name, username, password, role, email) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET name=$2, username=$3, password=$4, role=$5, email=$6',
            [id, name, username, password, role, email || '']
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ PROPOSALS ============
app.get('/api/proposals', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM proposals ORDER BY created_at ASC');
        // Frontend uyumluluğu için camelCase'e çevir
        const proposals = result.rows.map(rowToProposal);
        res.json(proposals);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/proposals', async (req, res) => {
    try {
        const p = req.body;
        await pool.query(`
            INSERT INTO proposals (id, proposal_no, status, customer_name, contact_person, customer_phone, customer_email, customer_fax, customer_address, tax_office, tax_number, delivery_date, order_no, date, currency, kdv_rate, payment_plan, reminder_date, items, discount, subtotal, discounted_subtotal, kdv, grand_total, additional_services, notes, sales_rep, created_by, created_at, updated_at, call_logs, reminder_completed, accept_token)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)
            ON CONFLICT (id) DO UPDATE SET
                status=$3, customer_name=$4, contact_person=$5, customer_phone=$6, customer_email=$7, customer_fax=$8, customer_address=$9, tax_office=$10, tax_number=$11, delivery_date=$12, order_no=$13, date=$14, currency=$15, kdv_rate=$16, payment_plan=$17, reminder_date=$18, items=$19, discount=$20, subtotal=$21, discounted_subtotal=$22, kdv=$23, grand_total=$24, additional_services=$25, notes=$26, sales_rep=$27, created_by=$28, updated_at=$30, call_logs=$31, reminder_completed=$32, accept_token=$33
        `, [
            p.id, p.proposalNo, p.status, p.customerName, p.contactPerson || '', p.customerPhone || '', p.customerEmail || '', p.customerFax || '', p.customerAddress || '', p.taxOffice || '', p.taxNumber || '', p.deliveryDate || '', p.orderNo || '', p.date || null, p.currency || 'USD', p.kdvRate || 20, p.paymentPlan || '', p.reminderDate || null, JSON.stringify(p.items || []), p.discount || 0, p.subtotal || 0, p.discountedSubtotal || 0, p.kdv || 0, p.grandTotal || 0, p.additionalServices || '', p.notes || '', p.salesRep || '', p.createdBy || '', p.createdAt || new Date().toISOString(), p.updatedAt || new Date().toISOString(), JSON.stringify(p.callLogs || []), p.reminderCompleted || false, p.acceptToken || ''
        ]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/proposals/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM proposals WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ CUSTOMERS ============
app.get('/api/customers', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM customers ORDER BY name');
        const customers = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            contactPerson: row.contact_person,
            phone: row.phone,
            email: row.email,
            fax: row.fax,
            taxOffice: row.tax_office,
            taxNumber: row.tax_number,
            address: row.address
        }));
        res.json(customers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/customers', async (req, res) => {
    try {
        const c = req.body;
        await pool.query(
            `INSERT INTO customers (id, name, contact_person, phone, email, fax, tax_office, tax_number, address)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (id) DO UPDATE SET name=$2, contact_person=$3, phone=$4, email=$5, fax=$6, tax_office=$7, tax_number=$8, address=$9`,
            [c.id, c.name, c.contactPerson || '', c.phone || '', c.email || '', c.fax || '', c.taxOffice || '', c.taxNumber || '', c.address || '']
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/customers/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ PRODUCTS ============
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY name');
        const products = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            price: parseFloat(row.price),
            currency: row.currency,
            category: row.category
        }));
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const p = req.body;
        await pool.query(
            `INSERT INTO products (id, name, price, currency, category)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (id) DO UPDATE SET name=$2, price=$3, currency=$4, category=$5`,
            [p.id, p.name, p.price || 0, p.currency || 'USD', p.category || '']
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ SETTINGS ============
app.get('/api/settings', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM settings');
        const settings = {};
        result.rows.forEach(row => {
            settings[row.key] = row.value;
        });
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        const settings = req.body;
        for (const [key, value] of Object.entries(settings)) {
            await pool.query(
                'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
                [key, JSON.stringify(value)]
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ HELPER ============
function rowToProposal(row) {
    return {
        id: row.id,
        proposalNo: row.proposal_no,
        status: row.status,
        customerName: row.customer_name,
        contactPerson: row.contact_person,
        customerPhone: row.customer_phone,
        customerEmail: row.customer_email,
        customerFax: row.customer_fax,
        customerAddress: row.customer_address,
        taxOffice: row.tax_office,
        taxNumber: row.tax_number,
        deliveryDate: row.delivery_date,
        orderNo: row.order_no,
        date: row.date,
        currency: row.currency,
        kdvRate: parseFloat(row.kdv_rate),
        paymentPlan: row.payment_plan,
        reminderDate: row.reminder_date,
        items: row.items || [],
        discount: parseFloat(row.discount),
        subtotal: parseFloat(row.subtotal),
        discountedSubtotal: parseFloat(row.discounted_subtotal),
        kdv: parseFloat(row.kdv),
        grandTotal: parseFloat(row.grand_total),
        additionalServices: row.additional_services,
        notes: row.notes,
        salesRep: row.sales_rep,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        callLogs: row.call_logs || [],
        reminderCompleted: row.reminder_completed,
        acceptToken: row.accept_token
    };
}

// SPA: tüm route'ları index.html'e yönlendir
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Sunucuyu başlat
app.listen(PORT, () => {
    console.log(`✓ BİLGESİS Teklif Sunucusu çalışıyor: http://localhost:${PORT}`);
});

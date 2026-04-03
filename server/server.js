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
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Şifre hashleme (bcrypt yerine native crypto - ek bağımlılık gerektirmez)
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 310000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    if (!stored.includes(':')) return password === stored; // eski plaintext uyumu
    const [salt, hash] = stored.split(':');
    const verify = crypto.pbkdf2Sync(password, salt, 310000, 64, 'sha512').toString('hex');
    return hash === verify;
}

// JWT benzeri token (basit, ek bağımlılık gerektirmez)
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

function generateToken(user) {
    const payload = JSON.stringify({ id: user.id, role: user.role, exp: Date.now() + 8 * 60 * 60 * 1000 });
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
    return Buffer.from(payload).toString('base64') + '.' + signature;
}

function verifyToken(token) {
    try {
        const [payloadB64, signature] = token.split('.');
        const payload = Buffer.from(payloadB64, 'base64').toString();
        const expected = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
        if (signature !== expected) return null;
        const data = JSON.parse(payload);
        if (data.exp < Date.now()) return null;
        return data;
    } catch { return null; }
}

// Auth middleware
function authMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Yetkilendirme gerekli' });
    }
    const token = auth.slice(7);
    if (tokenBlacklist.has(token)) return res.status(401).json({ error: 'Oturum sonlandırılmış' });
    const user = verifyToken(token);
    if (!user) return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token' });
    req.user = user;
    req.token = token;
    next();
}

// Admin yetki kontrolü
function adminOnly(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Bu işlem için yönetici yetkisi gerekli' });
    }
    next();
}

// Token blacklist (logout desteği)
const tokenBlacklist = new Set();

// Rate limiter (basit, ek bağımlılık gerektirmez)
const loginAttempts = new Map();
function loginRateLimit(req, res, next) {
    const ip = req.ip;
    const now = Date.now();
    const attempts = loginAttempts.get(ip) || [];
    const recent = attempts.filter(t => now - t < 5 * 60 * 1000); // son 5 dk
    if (recent.length >= 5) {
        return res.status(429).json({ error: 'Çok fazla giriş denemesi. 5 dakika bekleyin.' });
    }
    recent.push(now);
    loginAttempts.set(ip, recent);
    next();
}

// Genel API rate limiter
const apiRequests = new Map();
function apiRateLimit(req, res, next) {
    const ip = req.ip;
    const now = Date.now();
    const requests = apiRequests.get(ip) || [];
    const recent = requests.filter(t => now - t < 60 * 1000); // son 1 dk
    if (recent.length >= 100) {
        return res.status(429).json({ error: 'Çok fazla istek. Lütfen bekleyin.' });
    }
    recent.push(now);
    apiRequests.set(ip, recent);
    next();
}

// Input doğrulama yardımcıları
function validateString(val, maxLen = 500) {
    return typeof val === 'string' && val.length <= maxLen;
}
function validateEmail(val) {
    if (!val) return true; // opsiyonel
    return typeof val === 'string' && val.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
}
function validatePassword(val) {
    return typeof val === 'string' && val.length >= 8 && val.length <= 128;
}

// PostgreSQL bağlantısı
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'bilgesis_teklif',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
});

// Veritabanı tablolarını otomatik oluştur
async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                username VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'personel',
                email VARCHAR(200),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            -- Admin kullanıcısı aşağıda env değişkeninden oluşturulur

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
        `);
        // Admin kullanıcısını oluştur veya şifresini güncelle
        const adminPass = process.env.ADMIN_PASSWORD;
        const adminRow = await pool.query('SELECT id, password FROM users WHERE id = $1', ['admin1']);
        if (adminRow.rows.length === 0) {
            const hashed = hashPassword(adminPass || 'degistir123');
            await pool.query(
                'INSERT INTO users (id, name, username, password, role, email) VALUES ($1,$2,$3,$4,$5,$6)',
                ['admin1', 'Yönetici', 'admin', hashed, 'admin', '']
            );
            console.log('✓ Admin kullanıcısı oluşturuldu');
        } else if (adminPass) {
            // ADMIN_PASSWORD env varsa her zaman güncelle
            const hashed = hashPassword(adminPass);
            await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, 'admin1']);
            console.log('✓ Admin şifresi güncellendi');
        }
        console.log('✓ Veritabanı tabloları hazır');
    } catch (err) {
        console.error('Veritabanı init hatası:', err.message);
    }
}

// Middleware
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : (origin, callback) => {
            // Aynı sunucudan gelen isteklere izin ver (origin undefined = same-origin)
            callback(null, origin || true);
        },
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(apiRateLimit);

// Güvenlik başlıkları
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; font-src 'self' https://cdnjs.cloudflare.com; img-src 'self' data:; connect-src 'self'");
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});

// Statik dosyalar (frontend) - hem lokal hem Docker uyumlu
const frontendPath = fs.existsSync(path.join(__dirname, 'uygulama'))
    ? path.join(__dirname, 'uygulama')
    : path.join(__dirname, '..', 'uygulama');
app.use(express.static(frontendPath));

// ============ AUTH ============
app.post('/api/login', loginRateLimit, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Kullanıcı adı ve şifre gerekli' });
        }
        const result = await pool.query(
            'SELECT id, name, username, password, role, email FROM users WHERE username = $1',
            [username]
        );
        if (result.rows.length > 0 && verifyPassword(password, result.rows[0].password)) {
            const user = { id: result.rows[0].id, name: result.rows[0].name, username: result.rows[0].username, role: result.rows[0].role, email: result.rows[0].email };
            const token = generateToken(user);
            res.json({ success: true, user, token });
        } else {
            res.status(401).json({ success: false, message: 'Kullanıcı adı veya şifre hatalı!' });
        }
    } catch (err) {
        console.error('Login hatası:', err.message);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// ============ USERS ============
app.get('/api/users', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, username, role, email FROM users ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        console.error('Users GET hatası:', err.message);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

app.post('/api/users', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { id, name, username, password, role, email } = req.body;
        if (!name || !username || !password) {
            return res.status(400).json({ error: 'Ad, kullanıcı adı ve şifre gerekli' });
        }
        if (!validateString(name, 200) || !validateString(username, 100)) {
            return res.status(400).json({ error: 'Geçersiz ad veya kullanıcı adı' });
        }
        if (!password.includes(':') && !validatePassword(password)) {
            return res.status(400).json({ error: 'Şifre en az 8 karakter olmalıdır' });
        }
        if (email && !validateEmail(email)) {
            return res.status(400).json({ error: 'Geçersiz e-posta adresi' });
        }
        const allowedRoles = ['admin', 'personel'];
        if (role && !allowedRoles.includes(role)) {
            return res.status(400).json({ error: 'Geçersiz rol' });
        }
        const hashedPass = password.includes(':') ? password : hashPassword(password);
        await pool.query(
            'INSERT INTO users (id, name, username, password, role, email) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET name=$2, username=$3, password=$4, role=$5, email=$6',
            [id, name, username, hashedPass, role || 'personel', email || '']
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Users POST hatası:', err.message);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

app.delete('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
    try {
        if (req.params.id === 'admin1') {
            return res.status(400).json({ error: 'Ana yönetici hesabı silinemez' });
        }
        await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Users DELETE hatası:', err.message);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// ============ PROPOSALS ============
app.get('/api/proposals', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM proposals ORDER BY created_at ASC');
        // Frontend uyumluluğu için camelCase'e çevir
        const proposals = result.rows.map(rowToProposal);
        res.json(proposals);
    } catch (err) {
        console.error(err.message); res.status(500).json({ error: 'Sunucu hatası' });
    }
});

app.post('/api/proposals', authMiddleware, async (req, res) => {
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
        console.error(err.message); res.status(500).json({ error: 'Sunucu hatası' });
    }
});

app.delete('/api/proposals/:id', authMiddleware, async (req, res) => {
    try {
        await pool.query('DELETE FROM proposals WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err.message); res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// ============ CUSTOMERS ============
app.get('/api/customers', authMiddleware, async (req, res) => {
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
        console.error(err.message); res.status(500).json({ error: 'Sunucu hatası' });
    }
});

app.post('/api/customers', authMiddleware, async (req, res) => {
    try {
        const c = req.body;
        if (!c.name || !validateString(c.name, 300)) {
            return res.status(400).json({ error: 'Geçerli bir müşteri adı gerekli' });
        }
        if (c.email && !validateEmail(c.email)) {
            return res.status(400).json({ error: 'Geçersiz e-posta adresi' });
        }
        await pool.query(
            `INSERT INTO customers (id, name, contact_person, phone, email, fax, tax_office, tax_number, address)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (id) DO UPDATE SET name=$2, contact_person=$3, phone=$4, email=$5, fax=$6, tax_office=$7, tax_number=$8, address=$9`,
            [c.id, c.name, c.contactPerson || '', c.phone || '', c.email || '', c.fax || '', c.taxOffice || '', c.taxNumber || '', c.address || '']
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err.message); res.status(500).json({ error: 'Sunucu hatası' });
    }
});

app.delete('/api/customers/:id', authMiddleware, async (req, res) => {
    try {
        await pool.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err.message); res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// ============ PRODUCTS ============
app.get('/api/products', authMiddleware, async (req, res) => {
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
        console.error(err.message); res.status(500).json({ error: 'Sunucu hatası' });
    }
});

app.post('/api/products', authMiddleware, async (req, res) => {
    try {
        const p = req.body;
        if (!p.name || !validateString(p.name, 300)) {
            return res.status(400).json({ error: 'Geçerli bir ürün adı gerekli' });
        }
        if (p.price !== undefined && (isNaN(Number(p.price)) || Number(p.price) < 0)) {
            return res.status(400).json({ error: 'Geçersiz fiyat' });
        }
        await pool.query(
            `INSERT INTO products (id, name, price, currency, category)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (id) DO UPDATE SET name=$2, price=$3, currency=$4, category=$5`,
            [p.id, p.name, p.price || 0, p.currency || 'USD', p.category || '']
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err.message); res.status(500).json({ error: 'Sunucu hatası' });
    }
});

app.delete('/api/products/:id', authMiddleware, async (req, res) => {
    try {
        await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err.message); res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// ============ SETTINGS ============
app.get('/api/settings', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM settings');
        const settings = {};
        result.rows.forEach(row => {
            settings[row.key] = row.value;
        });
        res.json(settings);
    } catch (err) {
        console.error(err.message); res.status(500).json({ error: 'Sunucu hatası' });
    }
});

app.post('/api/settings', authMiddleware, adminOnly, async (req, res) => {
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
        console.error(err.message); res.status(500).json({ error: 'Sunucu hatası' });
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

// ============ E-POSTA GÖNDERME ============
const nodemailer = require('nodemailer');

app.post('/api/send-email', authMiddleware, async (req, res) => {
    try {
        const { to, subject, body, smtpHost, smtpPort, smtpUser, smtpPass, fromName, pdfBase64, pdfFilename } = req.body;

        if (!to || !smtpHost || !smtpUser || !smtpPass) {
            return res.status(400).json({ error: 'SMTP ayarları ve alıcı e-posta gereklidir.' });
        }

        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: parseInt(smtpPort) || 587,
            secure: parseInt(smtpPort) === 465,
            auth: {
                user: smtpUser,
                pass: smtpPass
            }
        });

        const mailOptions = {
            from: `"${fromName || smtpUser}" <${smtpUser}>`,
            to: to,
            subject: subject || '',
            text: body || ''
        };

        if (pdfBase64 && pdfFilename) {
            mailOptions.attachments = [{
                filename: pdfFilename,
                content: Buffer.from(pdfBase64, 'base64'),
                contentType: 'application/pdf'
            }];
        }

        await transporter.sendMail(mailOptions);

        res.json({ success: true });
    } catch (err) {
        console.error('E-posta gönderme hatası:', err.message);
        res.status(500).json({ error: 'E-posta gönderilemedi. Lütfen SMTP ayarlarınızı kontrol edin.' });
    }
});

// ============ LOGOUT ============
app.post('/api/logout', authMiddleware, (req, res) => {
    tokenBlacklist.add(req.token);
    res.json({ success: true });
});

// SPA: tüm route'ları index.html'e yönlendir
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Sunucuyu başlat
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`✓ BİLGESİS Teklif Sunucusu çalışıyor: http://localhost:${PORT}`);
    });
});

const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-client');

const app = express();
app.use(express.json());

// تشغيل وخدمة الملفات الثابتة داخل مجلد public
app.use(express.static(path.join(__dirname, 'public')));

// ربط متغيرات البيئة الخاصة بـ Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// تفعيل المسار الرئيسي ليفتح ملف index.html مباشرة بدلاً من ظهور Not Found
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// إرسال وحفظ الفاتورة وتوليد رقم متسلسل تلقائي
app.post('/api/invoices', async (req, res) => {
    try {
        const { port, declaration, date, carsData } = req.body;

        // 1. جلب آخر رقم فاتورة مسجل لتوليد الرقم التالي
        const { data: lastInvoice, error: maxError } = await supabase
            .from('invoices')
            .select('invoice_no')
            .order('invoice_no', { ascending: false })
            .limit(1);

        if (maxError) throw maxError;

        let nextInvoiceNo = 1;
        if (lastInvoice && lastInvoice.length > 0) {
            nextInvoiceNo = parseInt(lastInvoice[0].invoice_no) + 1;
        }

        // 2. إدخال الفاتورة الرئيسية
        const { data: insertedInvoice, error: invError } = await supabase
            .from('invoices')
            .insert([{ port, declaration, date, invoice_no: nextInvoiceNo }])
            .select();

        if (invError) throw invError;
        const invoiceId = insertedInvoice[0].id;

        // 3. تجهيز وإدخال بيانات السيارات المربوطة بالفاتورة
        const itemsToInsert = carsData.map(car => ({
            invoice_id: invoiceId,
            cars_count: car.cars,
            plate: car.plate,
            driver_name: car.driver,
            license_type: car.licenseType,
            amount: car.amount
        }));

        const { error: itemsError } = await supabase
            .from('invoice_items')
            .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        res.status(201).json({ success: true, invoiceId, invoiceNo: nextInvoiceNo });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// جلب تفاصيل الفاتورة كاملة لعرضها في صفحة invoice.html
app.get('/api/invoices/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: invoice, error: invError } = await supabase
            .from('invoices')
            .select('*')
            .eq('id', id)
            .single();

        if (invError) throw invError;

        const { data: items, error: itemsError } = await supabase
            .from('invoice_items')
            .select('*')
            .eq('invoice_id', id);

        if (itemsError) throw itemsError;

        res.json({
            port: invoice.port,
            declaration: invoice.declaration,
            date: invoice.date,
            invoice_no: invoice.invoice_no,
            carsData: items
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// تشغيل السيرفر على البورت المحدد
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
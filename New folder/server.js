const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// إعدادات الوصول والمجلدات العامة
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // يوجه السيرفر لقراءة ملفات HTML من مجلد public

// الاتصال بقاعدة بيانات Supabase باستخدام المتغيرات البيئية
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 1. استقبال بيانات الفاتورة وحفظها في قاعدة البيانات
app.post('/api/invoices', async (req, res) => {
    const { port, declaration, date, carsData } = req.body;

    try {
        // إدخال البيانات في جدول الفواتير الرئيسي
        const { data: invoiceData, error: invoiceError } = await supabase
            .from('invoices')
            .insert([{ port, declaration, invoice_date: date }])
            .select();

        if (invoiceError) throw invoiceError;

        const invoiceId = invoiceData[0].id;

        // تجهيز بيانات السيارات لربطها بالفاتورة عبر الـ id
        const carsToInsert = carsData.map(car => ({
            invoice_id: invoiceId,
            cars_count: parseInt(car.cars) || 0,
            plate: car.plate,
            driver_name: car.driver,
            license_type: car.licenseType,
            amount: parseFloat(car.amount) || 0
        }));

        // إدخال بيانات السيارات في جدول تفاصيل السيارات
        const { error: carsError } = await supabase
            .from('invoice_cars')
            .insert(carsToInsert);

        if (carsError) throw carsError;

        // إرجاع رقم الفاتورة الجديد للواجهة الأمامية
        res.status(201).json({ success: true, invoiceId: invoiceId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. جلب بيانات فاتورة معينة من قاعدة البيانات عبر الـ ID لعرضها وطباعتها
app.get('/api/invoices/:id', async (req, res) => {
    const invoiceId = req.params.id;

    try {
        // جلب الفاتورة الرئيسية
        const { data: invoice, error: invoiceError } = await supabase
            .from('invoices')
            .select('*')
            .eq('id', invoiceId)
            .single();

        if (invoiceError) throw invoiceError;

        // جلب تفاصيل السيارات التابعة لها
        const { data: cars, error: carsError } = await supabase
            .from('invoice_cars')
            .select('*')
            .eq('invoice_id', invoiceId);

        if (carsError) throw carsError;

        // تنسيق البيانات لإرسالها لصفحة invoice.html
        res.json({
            port: invoice.port,
            declaration: invoice.declaration,
            date: invoice.invoice_date,
            carsData: cars.map(car => ({
                cars: car.cars_count,
                plate: car.plate,
                driver: car.driver_name,
                licenseType: car.license_type,
                amount: car.amount
            }))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
const express = require('express');
const { createClient } = require('@supabase/supabase-client');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// الاتصال بقاعدة بيانات Supabase عبر المتغيرات البيئية
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. استقبال وحفظ الفاتورة الجديدة
app.post('/api/invoices', async (req, res) => {
    try {
        const { port, declaration, date, carsData } = req.body;

        // إدخال الفاتورة في جدول invoices الأساسي
        const { data: insertedInvoice, error: invError } = await supabase
            .from('invoices')
            .insert([{ port, declaration, date }])
            .select();

        if (invError) throw invError;
        if (!insertedInvoice || insertedInvoice.length === 0) {
            throw new Error("لم يتم إرجاع بيانات الفاتورة بعد الحفظ.");
        }
        
        const invoiceId = insertedInvoice[0].id;

        // تجهيز البيانات لتتوافق مع جدول invoice_cars الموضح في قاعدة بياناتك
        const itemsToInsert = carsData.map(car => ({
            invoice_id: invoiceId,
            cars_count: parseInt(car.cars) || 1,
            plate: car.plate || '',
            driver_name: car.driver || '',
            license_type: car.licenseType || 'ترانزيت',
            amount: parseFloat(car.amount) || 0.00
        }));

        // إدخال البيانات في جدول التفاصيل الصحيح invoice_cars
        const { error: itemsError } = await supabase
            .from('invoice_cars')
            .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        // إرجاع نجاح العملية مع الـ ID الفريد للانتقال الفوري للطباعة
        res.status(201).json({ success: true, invoiceId: invoiceId });
    } catch (error) {
        console.error("Error creating invoice:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. جلب تفاصيل الفاتورة لعرضها في صفحة الطباعة invoice.html
app.get('/api/invoices/:id', async (req, res) => {
    try {
        const invoiceId = req.params.id;

        // جلب بيانات الفاتورة الأساسية
        const { data: invoice, error: invError } = await supabase
            .from('invoices')
            .select('*')
            .eq('id', invoiceId)
            .single();

        if (invError) throw invError;

        // جلب تفاصيل الشاحنات التابعة لها من جدول invoice_cars
        const { data: cars, error: carsError } = await supabase
            .from('invoice_cars')
            .select('*')
            .eq('invoice_id', invoiceId);

        if (carsError) throw carsError;

        // دمج البيانات لإرسالها كاملة للواجهة
        const responseData = {
            invoice_no: invoice.id, // استخدام الـ id التلقائي ليكون هو رقم الفاتورة
            port: invoice.port,
            declaration: invoice.declaration,
            date: invoice.date,
            carsData: cars
        };

        res.json(responseData);
    } catch (error) {
        console.error("Error fetching invoice:", error);
        res.status(500).json({ error: error.message });
    }
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`//////////////////////////////////////////////////`);
    console.log(`السيرفر يعمل الآن بثبات على البورت: ${PORT} 🚀`);
    console.log(`//////////////////////////////////////////////////`);
});

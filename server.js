const express = require('express');
const { createClient } = require('@supabase/supabase-client');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// التحقق من وجود المتغيرات البيئية لمنع توقف السيرفر
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error("⚠️ خطأ: يرجى التأكد من إضافة SUPABASE_URL و SUPABASE_KEY في إعدادات Render (Environment Variables).");
}

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
            throw new Error("لم يتم إرجاع بيانات الفاتورة بعد الحفظ بنجاح.");
        }
        
        const invoiceId = insertedInvoice[0].id;

        // تجهيز مصفوفة البيانات لتطابق جدول invoice_cars الخاص بك
        const itemsToInsert = carsData.map(car => ({
            invoice_id: invoiceId,
            cars_count: parseInt(car.cars) || 1,
            plate: car.plate || '',
            driver_name: car.driver || '',
            license_type: car.licenseType || 'ترانزيت',
            amount: parseFloat(car.amount) || 0.00
        }));

        // الحفظ في جدول التفاصيل المعتمد لديك invoice_cars
        const { error: itemsError } = await supabase
            .from('invoice_cars')
            .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        res.status(201).json({ success: true, invoiceId: invoiceId });
    } catch (error) {
        console.error("Error creating invoice:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. جلب تفاصيل الفاتورة لصفحة العرض والطباعة
app.get('/api/invoices/:id', async (req, res) => {
    try {
        const invoiceId = req.params.id;

        // جلب البيانات الأساسية للفاتورة
        const { data: invoice, error: invError } = await supabase
            .from('invoices')
            .select('*')
            .eq('id', invoiceId)
            .single();

        if (invError) throw invError;

        // جلب البيانات التفصيلية من جدول الشاحنات المعتمد لديك
        const { data: cars, error: carsError } = await supabase
            .from('invoice_cars')
            .select('*')
            .eq('invoice_id', invoiceId);

        if (carsError) throw carsError;

        // تجهيز البيانات بشكل منظم لإرسالها لـ invoice.html
        const responseData = {
            invoice_no: invoice.id, 
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

// تشغيل السيرفر بثبات على المنصة المنشودة
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 السيرفر الجمركي يعمل بنجاح الآن على البورت: ${PORT}`);
    console.log(`=========================================`);
});

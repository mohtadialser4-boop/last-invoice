const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-client');

const app = express();

// تفعيل قراءة واستقبال بيانات JSON القادمة من الواجهات الأمامية
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تشغيل وخدمة ملفات واجهة المستخدم المستضافة داخل مجلد public تلقائياً
app.use(express.static(path.join(__dirname, 'public')));

// التحقق الفوري من ربط متغيرات السيرفر السحابية بقاعدة البيانات
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("⚠️ خطأ حرِج: لم يتم العثور على متغيرات البيئة SUPABASE_URL أو SUPABASE_KEY في إعدادات Render!");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// تفعيل المسار الرئيسي لتوجيه المتصفح إلى الواجهة الرئيسية فوراً بدلاً من Not Found
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// استقبال وحفظ الفواتير الجديدة في الجداول بشكل متسلسل تلقائي محمي
app.post('/api/invoices', async (req, res) => {
    try {
        const { port, declaration, date, carsData } = req.body;

        // 1. حساب الرقم التسلسلي التالي للفاتورة بناءً على آخر رقم تم إدخاله في الجدول
        const { data: lastInvoice, error: maxError } = await supabase
            .from('invoices')
            .select('invoice_no')
            .order('invoice_no', { ascending: false })
            .limit(1);

        if (maxError) throw maxError;

        let nextInvoiceNo = 1;
        if (lastInvoice && lastInvoice.length > 0 && lastInvoice[0].invoice_no) {
            nextInvoiceNo = parseInt(lastInvoice[0].invoice_no) + 1;
        }

        // 2. إدخال بيانات الفاتورة الرئيسية وحفظ قيمتها
        const { data: insertedInvoice, error: invError } = await supabase
            .from('invoices')
            .insert([{ port, declaration, date, invoice_no: nextInvoiceNo }])
            .select();

        if (invError) throw invError;
        if (!insertedInvoice || insertedInvoice.length === 0) {
            throw new Error("فشل السيرفر في جلب المعرف الفريد للفاتورة الجديدة.");
        }
        
        const invoiceId = insertedInvoice[0].id;

        // 3. ترتيب وإدخال مصفوفة الشاحنات والسيارات التابعة للفاتورة بالتفصيل
        const itemsToInsert = carsData.map(car => ({
            invoice_id: invoiceId,
            cars_count: parseInt(car.cars) || 1,
            plate: car.plate || '',
            driver_name: car.driver || '',
            license_type: car.licenseType || 'تخليص',
            amount: parseFloat(car.amount) || 0.00
        }));

        const { error: itemsError } = await supabase
            .from('invoice_items')
            .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        // إرجاع استجابة النجاح مصحوبة بالـ id للانتقال لصفحة العرض والطباعة
        res.status(201).json({ success: true, invoiceId, invoiceNo: nextInvoiceNo });
    } catch (error) {
        console.error("Error creating invoice:", error);
        res.status(500).json({ error: error.message });
    }
});

// مسار الاستعلام الفردي لجلب تفاصيل فاتورة معينة عبر الـ ID لعرضها في صفحة invoice.html
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
        console.error("Error fetching invoice:", error);
        res.status(500).json({ error: error.message });
    }
});

// إعداد المنفذ (Port) الافتراضي والديناميكي المتوافق مع بيئة Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل الآن بنجاح وثبات على البورت العالمي: ${PORT}`);
});

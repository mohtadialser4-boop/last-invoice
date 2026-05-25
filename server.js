const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("⚠️ خطأ: لم يتم العثور على متغيرات البيئة SUPABASE_URL أو SUPABASE_KEY في إعدادات Render!");
}

const supabase = createClient(supabaseUrl, supabaseKey);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/invoices', async (req, res) => {
    try {
        const { port, declaration, date, carsData } = req.body;

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

        const { data: insertedInvoice, error: invError } = await supabase
            .from('invoices')
            .insert([{ port, declaration, date, invoice_no: nextInvoiceNo }])
            .select();

        if (invError) throw invError;
        
        const invoiceId = insertedInvoice[0].id;

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

        res.status(201).json({ success: true, invoiceId, invoiceNo: nextInvoiceNo });
    } catch (error) {
        console.error("Error creating invoice:", error);
        res.status(500).json({ error: error.message });
    }
});

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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل الآن بثبات على البورت: ${PORT}`);
});

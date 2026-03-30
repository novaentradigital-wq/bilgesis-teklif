/* ============================================
   BILGESIS TEKLİF YÖNETİM SİSTEMİ
   PDF Oluşturma Modülü (jsPDF)
   ============================================ */

function generateProposalPDF(data, download = false, preview = false) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;
    const margin = 15;
    const contentWidth = pageWidth - 2 * margin;

    const settings = DB.getSettings();
    const companyName = settings.companyName || 'BİLGESİS BİLGİ TEKNOLOJİLERİ SAN. TİC. LTD ŞTİ.';
    const companyAddress = settings.address || '';
    const companyPhone = settings.phone || '';
    const companyFax = settings.fax || '';
    const companyWeb = settings.website || '';

    // Renk tanımları - Lacivert & Gri kurumsal tonlar
    const primaryColor = [15, 27, 61];     // #0f1b3d koyu lacivert
    const secondaryColor = [27, 45, 91];   // #1b2d5b orta lacivert
    const accentGray = [74, 85, 104];      // #4a5568 kurumsal gri
    const darkText = [26, 32, 44];         // #1a202c
    const grayText = [113, 128, 150];      // #718096
    const lightGray = [237, 240, 244];     // #edf0f4
    const white = [255, 255, 255];
    const borderColor = [210, 214, 220];   // #d2d6dc

    let y = margin;

    // ============ LOGO / BAŞLIK ============
    // Üst banner - lacivert gradient efekti
    doc.setFillColor(...primaryColor);
    doc.roundedRect(margin, y, contentWidth, 34, 2, 2, 'F');

    // Alt kısma biraz daha açık lacivert şerit
    doc.setFillColor(...secondaryColor);
    doc.rect(margin, y + 26, contentWidth, 8, 'F');
    // Alt köşeleri yuvarla
    doc.setFillColor(...primaryColor);

    // BILGESIS yazısı
    doc.setTextColor(...white);
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.text('BILGESIS', margin + 10, y + 16);

    // digital yazısı - küçük harf
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 174, 192); // açık gri-mavi
    doc.text('Teklif Yonetim', margin + 10, y + 23);

    // Sipariş & Teklif Formu başlığı
    doc.setTextColor(...white);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Siparis & Teklif Formu', pageWidth - margin - 8, y + 14, { align: 'right' });

    // Dekoratif ince çizgi
    doc.setDrawColor(160, 174, 192);
    doc.setLineWidth(0.3);
    doc.line(pageWidth - margin - 70, y + 17, pageWidth - margin - 8, y + 17);

    y += 38;

    // ============ FİRMA BİLGİLERİ ============
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(margin, y, contentWidth, 22, 1, 1, 'F');
    doc.setDrawColor(...borderColor);
    doc.roundedRect(margin, y, contentWidth, 22, 1, 1, 'S');

    doc.setTextColor(...darkText);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(turkishToAscii(companyName), margin + 4, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...grayText);
    if (companyAddress) doc.text(turkishToAscii(companyAddress), margin + 4, y + 11);
    if (companyPhone || companyFax) {
        let contactLine = '';
        if (companyPhone) contactLine += 'Tel: ' + companyPhone;
        if (companyFax) contactLine += '    Faks: ' + companyFax;
        doc.text(contactLine, margin + 4, y + 15.5);
    }
    if (companyWeb) doc.text(companyWeb, margin + 4, y + 19.5);

    // Sipariş No ve Tarih kutuları
    const boxX = pageWidth - margin - 60;
    doc.setFillColor(...white);
    doc.setDrawColor(...borderColor);
    doc.rect(boxX, y + 1, 58, 9, 'FD');
    doc.rect(boxX, y + 11, 58, 9, 'FD');

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...accentGray);
    doc.text('SIPARIS NO', boxX + 2, y + 6.5);
    doc.text('TARIH', boxX + 2, y + 17);

    doc.setTextColor(...darkText);
    doc.setFont('helvetica', 'normal');
    doc.text(data.orderNo || data.proposalNo || '', boxX + 30, y + 6.5);

    // Tarih formatlama
    let dateStr = '';
    if (data.date) {
        try {
            const d = new Date(data.date);
            dateStr = d.toLocaleDateString('tr-TR');
        } catch { dateStr = data.date; }
    }
    doc.text(dateStr, boxX + 30, y + 17);

    y += 26;

    // ============ MÜŞTERİ BİLGİLERİ ============
    doc.setDrawColor(...borderColor);

    const custTableY = y;
    const labelW = 35;
    const valW = 55;
    const rightLabelW = 30;
    const rightValW = contentWidth - labelW - valW - rightLabelW;
    const rowH = 7;

    const custRows = [
        { label: 'Firma / Musteri Adi', value: data.customerName || '' },
        { label: 'Adi, Soyadi', value: data.contactPerson || '', rightLabel: 'Teslim Tarihi', rightValue: data.deliveryDate || '' },
        { label: 'Telefon', value: data.customerPhone || '', rightLabel: 'E-posta', rightValue: data.customerEmail || '' },
        { label: 'Faks', value: data.customerFax || '', rightLabel: 'Para Birimi', rightValue: data.currency || 'TL' },
        { label: 'Vergi Dairesi', value: data.taxOffice || '', rightLabel: 'Vergi No:', rightValue: data.taxNumber || '' },
    ];

    const addrRow = { label: 'Adresi:', value: data.customerAddress || '' };

    doc.setFontSize(7);
    custRows.forEach((row, i) => {
        const rY = custTableY + i * rowH;

        // Sol label
        doc.setFillColor(245, 247, 250);
        doc.rect(margin, rY, labelW, rowH, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...accentGray);
        doc.text(row.label, margin + 2, rY + 4.8);

        // Sol değer
        doc.setFillColor(...white);
        doc.rect(margin + labelW, rY, valW, rowH, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...darkText);
        doc.text(turkishToAscii(String(row.value)), margin + labelW + 2, rY + 4.8);

        if (row.rightLabel) {
            // Sağ label
            doc.setFillColor(245, 247, 250);
            doc.rect(margin + labelW + valW, rY, rightLabelW, rowH, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...accentGray);
            doc.text(row.rightLabel, margin + labelW + valW + 2, rY + 4.8);

            // Sağ değer
            doc.setFillColor(...white);
            doc.rect(margin + labelW + valW + rightLabelW, rY, rightValW, rowH, 'FD');
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...darkText);
            doc.text(turkishToAscii(String(row.rightValue)), margin + labelW + valW + rightLabelW + 2, rY + 4.8);
        } else {
            // Firma adı için geniş alan
            doc.setFillColor(...white);
            doc.rect(margin + labelW, rY, contentWidth - labelW, rowH, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...darkText);
            doc.text(turkishToAscii(String(row.value)), margin + labelW + 2, rY + 4.8);
        }
    });

    // Adres satırı
    const addrY = custTableY + custRows.length * rowH;
    doc.setFillColor(245, 247, 250);
    doc.rect(margin, addrY, labelW, rowH, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...accentGray);
    doc.text(addrRow.label, margin + 2, addrY + 4.8);
    doc.setFillColor(...white);
    doc.rect(margin + labelW, addrY, contentWidth - labelW, rowH, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkText);
    doc.text(turkishToAscii(String(addrRow.value)).substring(0, 80), margin + labelW + 2, addrY + 4.8);

    y = addrY + rowH + 5;

    // ============ ÜRÜN TABLOSU ============
    const sym = getCurrencySymbol(data.currency);

    const tableData = (data.items || []).map((item, i) => [
        turkishToAscii(item.name),
        formatMoney(item.price) + ' ' + sym,
        String(item.qty),
        formatMoney(item.total) + ' ' + sym
    ]);

    doc.autoTable({
        startY: y,
        margin: { left: margin, right: margin },
        head: [['URUN BILGISI', 'Birim Fiyati', 'Adet', 'Tutari']],
        body: tableData,
        theme: 'grid',
        headStyles: {
            fillColor: primaryColor,
            textColor: white,
            fontSize: 7.5,
            fontStyle: 'bold',
            halign: 'center',
            cellPadding: 3
        },
        columnStyles: {
            0: { cellWidth: 'auto', halign: 'left', fontSize: 7 },
            1: { cellWidth: 30, halign: 'right', fontSize: 7 },
            2: { cellWidth: 15, halign: 'center', fontSize: 7 },
            3: { cellWidth: 30, halign: 'right', fontSize: 7, fontStyle: 'bold' }
        },
        bodyStyles: {
            fontSize: 7,
            cellPadding: 2.5,
            textColor: darkText,
            lineColor: borderColor,
            lineWidth: 0.2
        },
        alternateRowStyles: {
            fillColor: [245, 247, 250]
        }
    });

    y = doc.lastAutoTable.finalY + 3;

    // ============ İNDİRİM SATIRI ============
    if (data.discount && data.discount > 0) {
        doc.setFillColor(245, 247, 250);
        doc.setDrawColor(...borderColor);
        doc.rect(margin, y, contentWidth, 7, 'FD');
        doc.setTextColor(...secondaryColor);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('SIZE OZEL INDIRIM', margin + contentWidth / 2, y + 4.8, { align: 'center' });
        doc.text('-' + formatMoney(data.discount) + ' ' + sym, pageWidth - margin - 4, y + 4.8, { align: 'right' });
        y += 10;
    }

    // ============ ÖDEME & TOPLAM ============
    const summaryY = y;
    const leftColW = contentWidth * 0.50;
    const rightLabelColW = contentWidth * 0.25;
    const rightValColW = contentWidth * 0.25;

    const summaryRowH = 7.5;

    // Header row
    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(...borderColor);
    doc.rect(margin, summaryY, leftColW, summaryRowH, 'FD');
    doc.rect(margin + leftColW, summaryY, rightLabelColW, summaryRowH, 'FD');
    doc.setFillColor(...white);
    doc.rect(margin + leftColW + rightLabelColW, summaryY, rightValColW, summaryRowH, 'FD');

    doc.setTextColor(...accentGray);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('ODEME PLANI', margin + leftColW / 2, summaryY + 5, { align: 'center' });
    doc.text('ARA TOPLAM', margin + leftColW + rightLabelColW / 2, summaryY + 5, { align: 'center' });

    doc.setTextColor(...darkText);
    doc.setFont('helvetica', 'bold');
    doc.text(formatMoney(data.discountedSubtotal) + ' ' + sym, pageWidth - margin - 2, summaryY + 5, { align: 'right' });

    // Values row
    const valRowY = summaryY + summaryRowH;
    doc.setFillColor(...white);
    doc.rect(margin, valRowY, leftColW, summaryRowH, 'FD');
    doc.rect(margin + leftColW, valRowY, rightLabelColW, summaryRowH, 'FD');
    doc.rect(margin + leftColW + rightLabelColW, valRowY, rightValColW, summaryRowH, 'FD');

    doc.setTextColor(...darkText);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(turkishToAscii(data.paymentPlan || 'PESIN'), margin + leftColW / 2, valRowY + 5, { align: 'center' });

    doc.setTextColor(...accentGray);
    doc.setFontSize(7);
    doc.text('KDV %' + (data.kdvRate || 20), margin + leftColW + rightLabelColW / 2, valRowY + 5, { align: 'center' });

    doc.setTextColor(...darkText);
    doc.text(formatMoney(data.kdv) + ' ' + sym, pageWidth - margin - 2, valRowY + 5, { align: 'right' });

    // Grand total row - koyu lacivert
    const grandRowY = valRowY + summaryRowH;
    doc.setFillColor(...white);
    doc.rect(margin, grandRowY, leftColW, summaryRowH, 'FD');
    doc.setFillColor(...primaryColor);
    doc.rect(margin + leftColW, grandRowY, rightLabelColW + rightValColW, summaryRowH, 'F');

    doc.setTextColor(...white);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('GENEL TOPLAM', margin + leftColW + rightLabelColW / 2, grandRowY + 5.2, { align: 'center' });
    doc.text(formatMoney(data.grandTotal) + ' ' + sym, pageWidth - margin - 2, grandRowY + 5.2, { align: 'right' });

    y = grandRowY + summaryRowH + 8;

    // ============ EK HİZMETLER / TEMSİLCİ / ONAY ============
    const footerColW = contentWidth / 3;

    // Header
    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(...borderColor);
    doc.rect(margin, y, footerColW, 7, 'FD');
    doc.rect(margin + footerColW, y, footerColW, 7, 'FD');
    doc.rect(margin + 2 * footerColW, y, footerColW, 7, 'FD');

    doc.setTextColor(...accentGray);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('EK HIZMETLER', margin + footerColW / 2, y + 4.8, { align: 'center' });
    doc.text('SATIS TEMSILCISI', margin + footerColW + footerColW / 2, y + 4.8, { align: 'center' });
    doc.text('MUSTERI ONAY / KASE', margin + 2 * footerColW + footerColW / 2, y + 4.8, { align: 'center' });

    // Content
    const footContentY = y + 7;
    doc.setFillColor(...white);
    doc.rect(margin, footContentY, footerColW, 18, 'FD');
    doc.rect(margin + footerColW, footContentY, footerColW, 18, 'FD');
    doc.rect(margin + 2 * footerColW, footContentY, footerColW, 18, 'FD');

    doc.setTextColor(...darkText);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    if (data.additionalServices) {
        const lines = doc.splitTextToSize(turkishToAscii(data.additionalServices), footerColW - 6);
        doc.text(lines, margin + 3, footContentY + 6);
    }

    if (data.salesRep) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(turkishToAscii(data.salesRep), margin + footerColW + footerColW / 2, footContentY + 12, { align: 'center' });
    }

    y = footContentY + 22;

    // ============ NOTLAR ============
    const pdfNotes = settings.pdfNotes || '* Faturaya esas olacak tutar TL cinsinden olup, fatura tarihindeki T.C.M.B doviz satis kuru uzerinden hesaplanacaktir.\n* Teklifimiz 7 gun sure ile gecerlidir.\n* Satis fiyatlari belirtilen adetler icin gecerli olup, adetlerin degismesi halinde teklif revize edilecektir.\n* Kurulum ve destek hizmetleri musteri istegi dogrultusunda BILGESIS tarafindan verilecektir.';

    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...grayText);

    const noteLines = pdfNotes.split('\n');
    noteLines.forEach((line, i) => {
        if (y + 4 > 285) return;
        doc.text(turkishToAscii(line), margin, y + i * 4);
    });

    y += noteLines.length * 4 + 4;

    // Alt çizgi - lacivert
    if (y < 285) {
        doc.setDrawColor(...primaryColor);
        doc.setLineWidth(0.5);
        doc.line(margin, 287, pageWidth - margin, 287);

        doc.setTextColor(...accentGray);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        const footerText = 'BILGESIS Teklif Yonetim Sistemi' + (companyWeb ? ' | ' + companyWeb : '');
        doc.text(footerText, pageWidth / 2, 291, { align: 'center' });
    }

    // ============ ÇIKTI ============
    if (download) {
        doc.save(`bilgesis_teklif_${data.proposalNo || 'yeni'}.pdf`);
        return;
    }

    if (preview) {
        const pdfBlob = doc.output('blob');
        currentPDFBlob = pdfBlob;
        const url = URL.createObjectURL(pdfBlob);
        document.getElementById('pdfPreviewFrame').src = url;
        openModal('pdfPreviewModal');
        return;
    }

    return doc;
}

// Türkçe karakterleri ASCII'ye çevirme (jsPDF default font sınırlaması)
function turkishToAscii(text) {
    if (!text) return '';
    const map = {
        'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G',
        'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O',
        'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U'
    };
    return text.replace(/[çÇğĞıİöÖşŞüÜ]/g, c => map[c] || c);
}

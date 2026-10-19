const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT_DIR = path.join(process.cwd(), 'public', 'flags');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

/* أكثر 50 دولة شيوعًا في المسابقات العربية + أسماء دول صعبة */
const COUNTRIES = [
  // الخليج ومصر والشام
  { code: 'sa', name: 'المملكة العربية السعودية' },
  { code: 'eg', name: 'مصر' },
  { code: 'ae', name: 'الإمارات العربية المتحدة' },
  { code: 'kw', name: 'الكويت' },
  { code: 'qa', name: 'قطر' },
  { code: 'bh', name: 'البحرين' },
  { code: 'om', name: 'سلطنة عُمان' },
  { code: 'jo', name: 'الأردن' },
  { code: 'lb', name: 'لبنان' },
  { code: 'sy', name: 'سوريا' },
  { code: 'iq', name: 'العراق' },
  { code: 'ps', name: 'فلسطين' },
  
  // شمال أفريقيا والمغرب العربي
  { code: 'ma', name: 'المغرب' },
  { code: 'dz', name: 'الجزائر' },
  { code: 'tn', name: 'تونس' },
  { code: 'ly', name: 'ليبيا' },
  { code: 'sd', name: 'السودان' },
  
  // آسيا الكبرى والدول الإسلامية الشائعة
  { code: 'tr', name: 'تركيا' },
  { code: 'ir', name: 'إيران' },
  { code: 'pk', name: 'باكستان' },
  { code: 'in', name: 'الهند' },
  { code: 'id', name: 'إندونيسيا' },
  { code: 'my', name: 'ماليزيا' },
  { code: 'bn', name: 'بنغلاديش' },
  { code: 'af', name: 'أفغانستان' },
  { code: 'uz', name: 'أوزبكستان' },
  { code: 'kz', name: 'كازاخستان' },
  { code: 'az', name: 'أذربيجان' },
  { code: 'ge', name: 'جورجيا' },
  { code: 'am', name: 'أرمينيا' },
  
  // أوروبا وأمريكا الشمالية والجنوبية وأوقيانوسيا وأفريقيا
  { code: 'us', name: 'الولايات المتحدة الأمريكية' },
  { code: 'ca', name: 'كندا' },
  { code: 'gb', name: 'المملكة المتحدة' },
  { code: 'fr', name: 'فرنسا' },
  { code: 'de', name: 'ألمانيا' },
  { code: 'it', name: 'إيطاليا' },
  { code: 'es', name: 'إسبانيا' },
  { code: 'pt', name: 'البرتغال' },
  { code: 'nl', name: 'هولندا' },
  { code: 'be', name: 'بلجيكا' },
  { code: 'ch', name: 'سويسرا' },
  { code: 'se', name: 'السويد' },
  { code: 'no', name: 'النرويج' },
  { code: 'dk', name: 'الدنمارك' },
  { code: 'fi', name: 'فنلندا' },
  { code: 'pl', name: 'بولندا' },
  { code: 'cz', name: 'التشيك' },
  { code: 'gr', name: 'اليونان' },
  { code: 'ru', name: 'روسيا' },
  { code: 'ua', name: 'أوكرانيا' },
  { code: 'br', name: 'البرازيل' },
  { code: 'ar', name: 'الأرجنتين' },
  { code: 'mx', name: 'المكسيك' },
  { code: 'au', name: 'أستراليا' },
  { code: 'nz', name: 'نيوزيلندا' },
  { code: 'jp', name: 'اليابان' },
  { code: 'cn', name: 'الصين' },
  { code: 'kr', name: 'كوريا الجنوبية' },
  { code: 'za', name: 'جنوب أفريقيا' },
  { code: 'ng', name: 'نيجيريا' },
  { code: 'ke', name: 'كينيا' },
  { code: 'et', name: 'إثيوبيا' }
];

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(destPath);
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`Status ${response.statusCode}`));
      }
      
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close(() => resolve(true));
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {}); 
      reject(err);
    });
  });
}

async function main() {
  console.log('🚀 بدأ تحميل أعلام الدول (SVG)...');
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < COUNTRIES.length; i++) {
    const country = COUNTRIES[i];
    const fileName = `${country.code}.svg`;
    const destPath = path.join(OUT_DIR, fileName);
    
    // نستخدم خدمة flagcdn المجانية والمرخصة للاستخدام التجاري
    const url = `https://flagcdn.com/${fileName}`;
    
    try {
      await downloadFile(url, destPath);
      successCount++;
      process.stdout.write(`✅ تم تحميل: ${country.name} (${successCount}/${COUNTRIES.length})\n`);
    } catch (e) {
      failCount++;
      process.stderr.write(`❌ فشل تحميل: ${country.name} - ${e.message}\n`);
    }
  }

  console.log('\n========================================');
  console.log(`✅ اكتمل التحميل! ناجح: ${successCount}, فاشل: ${failCount}`);
  console.log(`📁 المجلد: ${OUT_DIR}`);
  console.log('========================================');
}

main().catch(console.error);

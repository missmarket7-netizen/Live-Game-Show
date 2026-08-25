const state={mode:'single',category:'معلومات عامة',difficulty:'متوسط',count:10,timerDuration:10,fullShowDuration:120,questions:[],currentQuestion:0,girlsScore:0,boysScore:0,girlsRounds:0,boysRounds:0,timer:null,timeLeft:10,soundOn:true,currentRound:1,savedQuestions:JSON.parse(localStorage.getItem('savedQuestions')||'[]')};
const $=id=>document.getElementById(id);
const screens={setup:$('setupScreen'),game:$('gameScreen'),results:$('resultsScreen')};
let audioCtx;
function ensureAudio(){if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();}
function playTone(freq,type,duration,vol=0.15){if(!state.soundOn||!audioCtx)return;const osc=audioCtx.createOscillator();const gain=audioCtx.createGain();osc.type=type;osc.frequency.value=freq;gain.gain.setValueAtTime(vol,audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+duration);osc.connect(gain);gain.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+duration);}
const sfx={click:()=>playTone(600,'sine',0.08,0.1),correct:()=>{playTone(523,'sine',0.15,0.12);setTimeout(()=>playTone(659,'sine',0.2,0.12),100);setTimeout(()=>playTone(784,'sine',0.3,0.12),200);},wrong:()=>{playTone(200,'sawtooth',0.3,0.08);setTimeout(()=>playTone(150,'sawtooth',0.3,0.08),150);},tick:()=>playTone(800,'square',0.05,0.06),end:()=>{playTone(440,'sine',0.2,0.1);setTimeout(()=>playTone(554,'sine',0.2,0.1),200);setTimeout(()=>playTone(659,'sine',0.4,0.1),400);},win:()=>{[523,659,784,1047].forEach((f,i)=>setTimeout(()=>playTone(f,'sine',0.4,0.12),i*120));}};
document.querySelectorAll('.tab').forEach(tab=>{tab.addEventListener('click',()=>{sfx.click();document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));tab.classList.add('active');state.mode=tab.dataset.mode;$('categoryGroup').style.display=state.mode==='fullshow'?'none':'block';$('fullShowOptions').style.display=state.mode==='fullshow'?'block':'none';});});
document.querySelectorAll('.chip[data-timer]').forEach(chip=>{chip.addEventListener('click',()=>{sfx.click();document.querySelectorAll('.chip[data-timer]').forEach(c=>c.classList.remove('active'));chip.classList.add('active');state.timerDuration=parseInt(chip.dataset.timer);});});
document.querySelectorAll('.chip[data-duration]').forEach(chip=>{chip.addEventListener('click',()=>{sfx.click();document.querySelectorAll('.chip[data-duration]').forEach(c=>c.classList.remove('active'));chip.classList.add('active');state.fullShowDuration=parseInt(chip.dataset.duration);});});
document.querySelectorAll('.num-btn').forEach(btn=>{btn.addEventListener('click',()=>{sfx.click();const input=$('count');let v=parseInt(input.value)||1;if(btn.dataset.action==='plus')v=Math.min(50,v+1);else v=Math.max(1,v-1);input.value=v;state.count=v;});});
$('count').addEventListener('change',e=>{let v=parseInt(e.target.value)||1;v=Math.max(1,Math.min(50,v));e.target.value=v;state.count=v;});
$('category').addEventListener('change',e=>state.category=e.target.value);
$('difficulty').addEventListener('change',e=>state.difficulty=e.target.value);

const AI_QUESTIONS_DB={
'معلومات عامة':{
'سهل':[{q:'ما هي عاصمة مصر؟',o:['القاهرة','الإسكندرية','الأقصر','أسوان'],a:'القاهرة',e:'القاهرة هي العاصمة منذ عام 969م.'},{q:'كم عدد أيام الأسبوع؟',o:['5','6','7','8'],a:'7',e:'الأسبوع يتكون من 7 أيام.'},{q:'ما هو لون السماء في النهار؟',o:['أحمر','أزرق','أخضر','أصفر'],a:'أزرق',e:'السماء تبدو زرقاء بسبب تشتت الضوء.'},{q:'كم عدد أصابع اليد الواحدة؟',o:['4','5','6','3'],a:'5',e:'اليد تحتوي على 5 أصابع.'},{q:'ما هو الحيوان الأسرع في العالم؟',o:['الأسد','الفهد','الحصان','النمر'],a:'الفهد',e:'الفهد يصل سرعته إلى 120 كم/ساعة.'}],
'متوسط':[{q:'ما هي أكبر قارة في العالم من حيث المساحة؟',o:['أفريقيا','آسيا','أمريكا الشمالية','أوروبا'],a:'آسيا',e:'آسيا تغطي حوالي 30% من مساحة اليابسة.'},{q:'كم عدد الكواكب في المجموعة الشمسية؟',o:['7','8','9','10'],a:'8',e:'بعد استبعاد بلوتو، أصبح عدد الكواكب 8.'},{q:'من هو مخترع المصباح الكهربائي؟',o:['تسلا','إديسون','أينشتاين','نيوتن'],a:'إديسون',e:'توماس إديسون طور المصباح الكهربائي العملي عام 1879.'},{q:'ما هي أعلى قمة جبلية في العالم؟',o:['كليمنجارو','إيفرست','ماكينلي','إلبروس'],a:'إيفرست',e:'جبل إيفرست يبلغ ارتفاعه 8,848 متر.'},{q:'كم عدد ألوان قوس قزح؟',o:['5','6','7','8'],a:'7',e:'الألوان السبعة: أحمر، برتقالي، أصفر، أخضر، أزرق، نيلي، بنفسجي.'}],
'صعب':[{q:'ما هو العنصر الكيميائي الأكثر وفرة في الكون؟',o:['الهيليوم','الأكسجين','الهيدروجين','الكربون'],a:'الهيدروجين',e:'الهيدروجين يشكل حوالي 75% من الكتلة العادية للمادة في الكون.'},{q:'في أي عام تم اختراع الطباعة بالحروف المتحركة؟',o:['1440','1492','1500','1400'],a:'1440',e:'يوهان غوتنبرغ اخترع الطباعة حوالي عام 1440.'},{q:'ما هي أصغر دولة في العالم من حيث المساحة؟',o:['موناكو','الفاتيكان','سان مارينو','ليختنشتاين'],a:'الفاتيكان',e:'الفاتيكان مساحتها 0.44 كم².'},{q:'كم عدد عظام جسم الإنسان البالغ؟',o:['206','208','210','200'],a:'206',e:'جسم الإنسان البالغ يحتوي على 206 عظمة.'},{q:'ما هو أعمق نقطة في المحيطات؟',o:['خندق ماريانا','خندق تونجا','خندق بورتوريكو','خندق الفلبين'],a:'خندق ماريانا',e:'عمق خندق ماريانا يصل إلى حوالي 11,034 متر.'}]
},
'جغرافيا':{
'سهل':[{q:'ما هي عاصمة فرنسا؟',o:['لندن','باريس','روما','مدريد'],a:'باريس',e:'باريس هي عاصمة فرنسا وأكبر مدنها.'},{q:'في أي قارة تقع مصر؟',o:['آسيا','أفريقيا','أوروبا','أمريكا'],a:'أفريقيا',e:'مصر تقع في شمال شرق أفريقيا.'},{q:'ما هو أكبر محيط في العالم؟',o:['الأطلسي','الهندي','الهادئ','المتجمد'],a:'الهادئ',e:'المحيط الهادئ هو الأكبر ويغطي ثلث سطح الأرض.'}],
'متوسط':[{q:'ما هي أطول نهر في العالم؟',o:['النيل','الأمازون','المسيسيبي','اليانغتسي'],a:'النيل',e:'نهر النيل يبلغ طوله حوالي 6,650 كم.'},{q:'كم عدد المحيطات في العالم؟',o:['4','5','6','7'],a:'5',e:'المحيطات الخمسة: الهادئ، الأطلسي، الهندي، المتجمد الجنوبي، المتجمد الشمالي.'},{q:'ما هي عاصمة اليابان؟',o:['أوساكا','كيوتو','طوكيو','ناجويا'],a:'طوكيو',e:'طوكيو هي عاصمة اليابان وأكبر مدينة فيها.'}],
'صعب':[{q:'ما هي أصغر دولة عربية من حيث المساحة؟',o:['لبنان','الكويت','البحرين','قطر'],a:'البحرين',e:'مملكة البحرين هي أصغر دولة عربية مساحةً.'},{q:'في أي بحر تقع جزر المالديف؟',o:['البحر الأحمر','المحيط الهندي','بحر العرب','بحر الصين'],a:'المحيط الهندي',e:'المالديف تقع في المحيط الهندي جنوب غرب سريلانكا.'}]
},
'علوم':{
'سهل':[{q:'كم عدد أرجل العنكبوت؟',o:['6','8','10','4'],a:'8',e:'العنكبوت من فصيلة العنكبوتيات ولديه 8 أرجل.'},{q:'ما هي وحدة قياس الوزن الأساسية؟',o:['لتر','متر','كيلوغرام','ثانية'],a:'كيلوغرام',e:'الكيلوغرام هي وحدة قياس الكتلة في النظام الدولي.'}],
'متوسط':[{q:'ما هو أقرب كوكب إلى الشمس؟',o:['الزهرة','عطارد','المريخ','الأرض'],a:'عطارد',e:'عطارد هو أقرب كوكب إلى الشمس وأصغر كواكب المجموعة الشمسية.'},{q:'كم عدد الكروموسومات في الخلية البشرية؟',o:['23','46','48','22'],a:'46',e:'الإنسان لديه 23 زوجاً من الكروموسومات أي 46 كروموسوماً.'}],
'صعب':[{q:'ما هو أخف عنصر كيميائي؟',o:['الهيليوم','الهيدروجين','الليثيوم','البورون'],a:'الهيدروجين',e:'الهيدروجين له العدد الذري 1 وهو أخف العناصر.'},{q:'ما هي سرعة الضوء تقريباً؟',o:['300,000 كم/ث','150,000 كم/ث','500,000 كم/ث','1,000,000 كم/ث'],a:'300,000 كم/ث',e:'سرعة الضوء في الفراغ حوالي 299,792 كم/ثانية.'}]
},
'تاريخ':{
'سهل':[{q:'في أي عام تأسست دولة الإمارات؟',o:['1970','1971','1972','1969'],a:'1971',e:'تأسست دولة الإمارات العربية المتحدة في 2 ديسمبر 1971.'},{q:'من هو مؤسس المملكة العربية السعودية؟',o:['الملك فهد','الملك عبدالعزيز','الملك سعود','الملك فيصل'],a:'الملك عبدالعزيز',e:'الملك عبدالعزيز آل سعود هو مؤسس المملكة الحديثة.'}],
'متوسط':[{q:'في أي عام سقطت القسطنطينية؟',o:['1450','1453','1460','1449'],a:'1453',e:'سقطت القسطنطينية عام 1453 على يد السلطان محمد الفاتح.'},{q:'كم استمرت الحرب العالمية الثانية؟',o:['4 سنوات','5 سنوات','6 سنوات','7 سنوات'],a:'6 سنوات',e:'استمرت من 1939 إلى 1945.'}],
'صعب':[{q:'من هو أول خليفة في الإسلام؟',o:['علي بن أبي طالب','عمر بن الخطاب','أبو بكر الصديق','عثمان بن عفان'],a:'أبو بكر الصديق',e:'أبو بكر الصديق هو أول الخلفاء الراشدين.'},{q:'في أي عام تم فتح مكة؟',o:['630م','628م','632م','625م'],a:'630م',e:'فتح مكة كان في السنة الثامنة للهجرة عام 630م.'}]
},
'أسئلة دينية':{
'سهل':[{q:'كم عدد أركان الإسلام؟',o:['4','5','6','7'],a:'5',e:'أركان الإسلام الخمسة: الشهادتان، الصلاة، الزكاة، الصوم، الحج.'},{q:'في أي شهر يصوم المسلمون؟',o:['شوال','رمضان','ذو الحجة','محرم'],a:'رمضان',e:'شهر رمضان هو شهر الصيام في الإسلام.'}],
'متوسط':[{q:'كم عدد سور القرآن الكريم؟',o:['112','113','114','115'],a:'114',e:'القرآن الكريم يحتوي على 114 سورة.'},{q:'ما هي السورة التي تسمى قلب القرآن؟',o:['الفاتحة','الإخلاص','يس','الرحمن'],a:'يس',e:'سورة يس تُعرف بقلب القرآن الكريم.'}],
'صعب':[{q:'كم عدد أحاديث كتاب صحيح البخاري؟',o:['أكثر من 7000','أقل من 3000','حوالي 5000','حوالي 10000'],a:'أكثر من 7000',e:'صحيح البخاري يحتوي على 7275 حديثاً تقريباً.'},{q:'من هو الصحابي الذي لقب بسيف الله المسلول؟',o:['عمر بن الخطاب','علي بن أبي طالب','خالد بن الوليد','حمزة بن عبد المطلب'],a:'خالد بن الوليد',e:'لُقب خالد بن الوليد بسيف الله المسلول.'}]
},
'ألغاز':{
'سهل':[{q:'ما هو الشيء الذي يُكسر إذا نطق به اسمه؟',o:['الزجاج','الصمت','الورق','الخشب'],a:'الصمت',e:'الصمت يُكسر عندما نتكلم.'},{q:'ما هو الشيء الذي يمشي بلا رجلين؟',o:['السحاب','الطائر','السمك','الدابة'],a:'السمك',e:'السمك يسبح في الماء بلا رجلين.'}],
'متوسط':[{q:'ما هو الشيء الذي له أسنان ولا يعض؟',o:['المشط','السكين','المنشار','القلم'],a:'المشط',e:'المشط له أسنان لكنه لا يعض.'},{q:'ما هو الشيء الذي يُحصى ولا يُرى؟',o:['النجوم','الأيام','الأرقام','الحساب'],a:'الأيام',e:'الأيام تُحصى لكن لا يمكن رؤيتها.'}],
'صعب':[{q:'ما هو الشيء الذي يُولد مرة ويموت مرتين؟',o:['الإنسان','الطائر','الفراشة','السمك'],a:'الفراشة',e:'الفراشة تُولد كيرقة، ثم تصبح شرنقة (موت أول)، ثم فراشة (موت ثاني).'},{q:'ما هو الشيء الذي كلما زاد نقص؟',o:['العمر','الحفرة','العلم','الوقت'],a:'الحفرة',e:'كلما حفرت أكثر، زادت الحفرة ونقص التراب.'}]
},
'رياضة':{
'سهل':[{q:'كم عدد لاعبي فريق كرة القدم في الملعب؟',o:['10','11','12','9'],a:'11',e:'فريق كرة القدم يتكون من 11 لاعباً في الملعب.'},{q:'في أي رياضة يُستخدم المضرب والشuttlecock؟',o:['التنس','الريشة الطائرة','البينج بونج','الاسكواش'],a:'الريشة الطائرة',e:'الريشة الطائرة تُلعب بمضرب وشuttlecock.'}],
'متوسط':[{q:'كم عدد حلقات الألعاب الأولمبية؟',o:['4','5','6','7'],a:'5',e:'الحلقات الخمس تمثل القارات الخمس.'},{q:'من هو أسطورة كرة القدم الأرجنتيني؟',o:['بيليه','مارادونا','رونالدو','زيدان'],a:'مارادونا',e:'دييغو مارادونا من أعظم لاعبي كرة القدم.'}],
'صعب':[{q:'في أي عام أقيمت أول دورة أولمبية حديثة؟',o:['1894','1896','1900','1892'],a:'1896',e:'أقيمت أول دورة أولمبية حديثة في أثينا 1896.'},{q:'كم عدد الأشواط في مباراة التنس الرجالي في البطولات الكبرى؟',o:['3','5','7','9'],a:'5',e:'مباريات التنس الرجالي في البطولات الكبرى تُلعب لأفضل 5 أشواط.'}]
},
'تكنولوجيا':{
'سهل':[{q:'ما هي أكبر شركة تقنية في العالم؟',o:['مايكروسوفت','أبل','جوجل','أمازون'],a:'أبل',e:'أبل هي أكبر شركة تقنية من حيث القيمة السوقية.'},{q:'ما هو اختصار HTML؟',o:['Hyper Text Markup Language','High Tech Modern Language','Hyper Transfer Markup Link','Home Tool Markup Language'],a:'Hyper Text Markup Language',e:'HTML هي لغة ترميز النصوص الفائقة.'}],
'متوسط':[{q:'من هو مؤسس شركة مايكروسوفت؟',o:['ستيف جوبز','بيل غيتس','مارك زوكربيرغ','إيلون ماسك'],a:'بيل غيتس',e:'بيل غيتس وبال ألين أسسا مايكروسوفت عام 1975.'},{q:'ما هي لغة البرمجة الأكثر شيوعاً؟',o:['C++','Java','Python','JavaScript'],a:'Python',e:'Python هي من أكثر لغات البرمجة شيوعاً واستخداماً.'}],
'صعب':[{q:'في أي عام تم إطلاق أول iPhone؟',o:['2005','2006','2007','2008'],a:'2007',e:'أطلق ستيف جوبز أول iPhone عام 2007.'},{q:'ما هو اسم أول حاسوب إلكتروني عام؟',o:['ENIAC','UNIVAC','IBM PC','Altair'],a:'ENIAC',e:'ENIAC كان أول حاسوب إلكتروني عام البرمجة عام 1945.'}]
}
};

function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function generateQuestions(){const db=AI_QUESTIONS_DB[state.category];if(!db)return[];const pool=db[state.difficulty]||db['متوسط'];let qs=shuffle(pool);if(qs.length<state.count){while(qs.length<state.count)qs=qs.concat(shuffle(pool));}qs=qs.slice(0,state.count);return qs.map(q=>{const opts=shuffle(q.o);return{...q,o:opts};});}

$('generateBtn').addEventListener('click',async()=>{
ensureAudio();sfx.click();
$('loadingOverlay').classList.remove('hidden');
$('loadingText').textContent='جاري توليد الأسئلة بالذكاء الاصطناعي...';
await new Promise(r=>setTimeout(r,1500));
state.questions=generateQuestions();
state.currentQuestion=0;state.girlsScore=0;state.boysScore=0;state.girlsRounds=0;state.boysRounds=0;state.currentRound=1;
const saved=JSON.parse(localStorage.getItem('savedQuestions')||'[]');
const newEntry={id:Date.now(),date:new Date().toLocaleString('ar-SA'),category:state.category,difficulty:state.difficulty,count:state.count,questions:state.questions};
saved.unshift(newEntry);if(saved.length>20)saved.length=20;
localStorage.setItem('savedQuestions',JSON.stringify(saved));state.savedQuestions=saved;
$('loadingOverlay').classList.add('hidden');
showScreen('game');loadQuestion();resetScores();
});

function showScreen(name){Object.values(screens).forEach(s=>s.classList.add('hidden'));screens[name].classList.remove('hidden');}
function resetScores(){state.girlsScore=0;state.boysScore=0;state.girlsRounds=0;state.boysRounds=0;updateScoreDisplay();updateRoundsDisplay();document.querySelectorAll('.score-box').forEach(b=>{b.classList.remove('filled-girls','filled-boys');b.textContent='';});}
function updateScoreDisplay(){const girlsBoxes=document.querySelectorAll('#girlsScoreBoxes .score-box');const boysBoxes=document.querySelectorAll('#boysScoreBoxes .score-box');girlsBoxes.forEach((b,i)=>{if(i<state.girlsScore){b.classList.add('filled-girls');b.textContent='👧';}else{b.classList.remove('filled-girls');b.textContent='';}});boysBoxes.forEach((b,i)=>{if(i<state.boysScore){b.classList.add('filled-boys');b.textContent='👦';}else{b.classList.remove('filled-boys');b.textContent='';}});}
function updateRoundsDisplay(){$('girlsRoundsWon').textContent=`🏆 ${state.girlsRounds}`;$('boysRoundsWon').textContent=`🏆 ${state.boysRounds}`;}

function loadQuestion(){
const q=state.questions[state.currentQuestion];
if(!q){showResults();return;}
$('questionCounter').textContent=`السؤال ${state.currentQuestion+1} / ${state.questions.length}`;
$('categoryBadge').textContent=`${state.category}`;
$('questionText').textContent=q.q;
$('answerReveal').classList.add('hidden');
const grid=$('optionsGrid');grid.innerHTML='';
const letters=['أ','ب','ج','د'];
q.o.forEach((opt,i)=>{const btn=document.createElement('button');btn.className='option-btn';btn.dataset.letter=letters[i];btn.textContent=opt;btn.addEventListener('click',()=>selectOption(btn,opt,q.a));grid.appendChild(btn);});
state.timeLeft=state.timerDuration;
$('timerDisplay').textContent=state.timeLeft;
$('timerDisplay').classList.remove('urgent');
$('roundDisplay').textContent=`الجولة ${state.currentRound}`;
$('startTimerBtn').disabled=false;
$('revealBtn').disabled=false;
$('nextBtn').disabled=true;
}

function selectOption(btn,selected,correct){
if(btn.classList.contains('correct')||btn.classList.contains('wrong'))return;
const allBtns=document.querySelectorAll('.option-btn');
allBtns.forEach(b=>b.disabled=true);
if(selected===correct){btn.classList.add('correct');sfx.correct();}
else{btn.classList.add('wrong');allBtns.forEach(b=>{if(b.textContent===correct)b.classList.add('correct');});sfx.wrong();}
showAnswer(correct);
$('nextBtn').disabled=false;
$('startTimerBtn').disabled=true;
stopTimer();
}

function showAnswer(correct){const q=state.questions[state.currentQuestion];$('answerText').textContent=correct;$('explanationText').textContent=q.e||'';$('answerReveal').classList.remove('hidden');}

function startTimer(){if(state.timer)clearInterval(state.timer);$('startTimerBtn').disabled=true;state.timer=setInterval(()=>{state.timeLeft--;$('timerDisplay').textContent=state.timeLeft;if(state.timeLeft<=3){sfx.tick();$('timerDisplay').classList.add('urgent');}if(state.timeLeft<=0){stopTimer();autoReveal();}},1000);}

function stopTimer(){if(state.timer){clearInterval(state.timer);state.timer=null;}}

function autoReveal(){const q=state.questions[state.currentQuestion];const allBtns=document.querySelectorAll('.option-btn');allBtns.forEach(b=>{b.disabled=true;if(b.textContent===q.a)b.classList.add('correct');});showAnswer(q.a);$('nextBtn').disabled=false;sfx.end();}

$('startTimerBtn').addEventListener('click',()=>{ensureAudio();sfx.click();startTimer();});

$('revealBtn').addEventListener('click',()=>{ensureAudio();sfx.click();const q=state.questions[state.currentQuestion];const allBtns=document.querySelectorAll('.option-btn');allBtns.forEach(b=>{b.disabled=true;if(b.textContent===q.a)b.classList.add('correct');});showAnswer(q.a);$('nextBtn').disabled=false;stopTimer();});

$('nextBtn').addEventListener('click',()=>{ensureAudio();sfx.click();state.currentQuestion++;if(state.currentQuestion>=state.questions.length){showResults();}else{loadQuestion();}});

$('girlsPlusBtn').addEventListener('click',()=>{ensureAudio();sfx.click();if(state.girlsScore<5){state.girlsScore++;updateScoreDisplay();}});
$('boysPlusBtn').addEventListener('click',()=>{ensureAudio();sfx.click();if(state.boysScore<5){state.boysScore++;updateScoreDisplay();}});
$('girlsMinusBtn').addEventListener('click',()=>{ensureAudio();sfx.click();if(state.girlsScore>0){state.girlsScore--;updateScoreDisplay();}});
$('boysMinusBtn').addEventListener('click',()=>{ensureAudio();sfx.click();if(state.boysScore>0){state.boysScore--;updateScoreDisplay();}});

$('endRoundBtn').addEventListener('click',()=>{ensureAudio();sfx.click();endRound();});


function endRound(){
stopTimer();
let winnerText='';
if(state.girlsScore>state.boysScore){winnerText='🎉 مبروك لفريق البنات!';state.girlsRounds++;}
else if(state.boysScore>state.girlsScore){winnerText='🎉 مبروك لفريق الشباب!';state.boysRounds++;}
else{winnerText='🤝 تعادل! جولة رائعة من الفريقين!';}
updateRoundsDisplay();
$('roundEndNumber').textContent=`الجولة ${state.currentRound}`;
$('roundEndWinner').textContent=winnerText;
$('roundEndGirlsScore').textContent=state.girlsScore;
$('roundEndBoysScore').textContent=state.boysScore;
const girlsScoreEl=$('roundEndGirlsScore');
const boysScoreEl=$('roundEndBoysScore');
girlsScoreEl.style.color=state.girlsScore>state.boysScore?'var(--pink)':(state.girlsScore===state.boysScore?'var(--gold)':'var(--text-dim)');
boysScoreEl.style.color=state.boysScore>state.girlsScore?'var(--blue)':(state.girlsScore===state.boysScore?'var(--gold)':'var(--text-dim)');
$('roundEndOverlay').classList.remove('hidden');
if(state.girlsScore!==state.boysScore){sfx.win();startConfetti();}else{sfx.end();}
}

$('roundEndContinueBtn').addEventListener('click',()=>{ensureAudio();sfx.click();$('roundEndOverlay').classList.add('hidden');stopConfetti();state.girlsScore=0;state.boysScore=0;state.currentRound++;state.currentQuestion=0;updateScoreDisplay();document.querySelectorAll('.score-box').forEach(b=>{b.classList.remove('filled-girls','filled-boys');b.textContent='';});state.questions=shuffle(state.questions);loadQuestion();});

$('newRoundBtn').addEventListener('click',()=>{ensureAudio();sfx.click();if(confirm('هل تريد بدء جولة جديدة؟')){stopTimer();showScreen('setup');stopConfetti();}});

function showResults(){showScreen('results');$('finalGirlsScore').textContent=state.girlsScore;$('finalBoysScore').textContent=state.boysScore;let txt='';if(state.girlsScore>state.boysScore)txt='🎉 الفائز: فريق البنات!';else if(state.boysScore>state.girlsScore)txt='🎉 الفائز: فريق الشباب!';else txt='🤝 تعادل! أداء رائع من الفريقين!';$('winnerText').textContent=txt;if(state.girlsScore!==state.boysScore){sfx.win();startConfetti();}}

$('replayBtn').addEventListener('click',()=>{ensureAudio();sfx.click();stopConfetti();showScreen('setup');});

document.querySelectorAll('.gift-item').forEach(item=>{item.addEventListener('click',()=>{ensureAudio();sfx.click();document.querySelectorAll('.gift-item').forEach(i=>i.classList.remove('active'));item.classList.add('active');const gift=item.dataset.gift;handleGift(gift);setTimeout(()=>item.classList.remove('active'),1000);});});

function handleGift(gift){switch(gift){case'tiktok':if(state.girlsScore>state.boysScore&&state.girlsScore>0)state.girlsScore--;else if(state.boysScore>state.girlsScore&&state.boysScore>0)state.boysScore--;else if(state.girlsScore>0)state.girlsScore--;updateScoreDisplay();break;case'cat':state.girlsScore=Math.min(5,state.girlsScore*2||1);updateScoreDisplay();break;case'crown':state.girlsScore=Math.min(5,state.girlsScore+1);state.boysScore=Math.min(5,state.boysScore+1);updateScoreDisplay();break;case'heart':showToast('❤️ درع الحماية مفعل!');break;case'rose':if(state.boysScore>0)state.boysScore--;updateScoreDisplay();break;case'donut':state.boysScore=Math.min(5,state.boysScore*2||1);updateScoreDisplay();break;case'corgi':state.girlsScore=Math.min(5,state.girlsScore+1);state.boysScore=Math.min(5,state.boysScore+1);updateScoreDisplay();break;}}

function showToast(msg){const toast=document.createElement('div');toast.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);background:var(--bg-card);color:var(--gold);padding:12px 24px;border-radius:12px;border:2px solid var(--gold);z-index:1002;font-weight:700;animation:fadeIn 0.3s ease;';toast.textContent=msg;document.body.appendChild(toast);setTimeout(()=>toast.remove(),2000);}

$('soundToggle').addEventListener('click',()=>{state.soundOn=!state.soundOn;$('soundToggle').textContent=state.soundOn?'🔊':'🔇';if(state.soundOn)ensureAudio();});

let confettiAnim=null;
function startConfetti(){const canvas=$('confettiCanvas');const ctx=canvas.getContext('2d');canvas.width=window.innerWidth;canvas.height=window.innerHeight;const particles=[];const colors=['#ff4d8d','#4d8dff','#ffd700','#2ed573','#ff4757','#7eb3ff','#ff7eb3'];for(let i=0;i<150;i++){particles.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height-canvas.height,size:Math.random()*8+4,color:colors[Math.floor(Math.random()*colors.length)],speed:Math.random()*3+2,rotation:Math.random()*360,rotationSpeed:Math.random()*4-2});}function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);particles.forEach(p=>{ctx.save();ctx.translate(p.x,p.y);ctx.rotate((p.rotation*Math.PI)/180);ctx.fillStyle=p.color;ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);ctx.restore();p.y+=p.speed;p.rotation+=p.rotationSpeed;if(p.y>canvas.height){p.y=-20;p.x=Math.random()*canvas.width;}});confettiAnim=requestAnimationFrame(draw);}draw();}

function stopConfetti(){if(confettiAnim){cancelAnimationFrame(confettiAnim);confettiAnim=null;}const canvas=$('confettiCanvas');const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);}

window.addEventListener('resize',()=>{const canvas=$('confettiCanvas');canvas.width=window.innerWidth;canvas.height=window.innerHeight;});

document.addEventListener('keydown',e=>{if(screens.game.classList.contains('hidden'))return;switch(e.key){case' ':e.preventDefault();$('startTimerBtn').click();break;case'Enter':e.preventDefault();$('revealBtn').click();break;case'ArrowRight':e.preventDefault();$('nextBtn').click();break;case'g':case'G':$('girlsPlusBtn').click();break;case'b':case'B':$('boysPlusBtn').click();break;}});

showScreen('setup');

function endRound() {
  stopTimer();

  let winnerText = '';
  if (state.girlsScore > state.boysScore) {
    winnerText = '🎉 مبروك لفريق البنات!';
    state.girlsRounds++;
  } else if (state.boysScore > state.girlsScore) {
    winnerText = '🎉 مبروك لفريق الشباب!';
    state.boysRounds++;
  } else {
    winnerText = '🤝 تعادل! جولة رائعة من الفريقين!';
  }

  updateRoundsDisplay();

  $('roundEndNumber').textContent = `الجولة ${state.currentRound}`;
  $('roundEndWinner').textContent = winnerText;
  $('roundEndGirlsScore').textContent = state.girlsScore;
  $('roundEndBoysScore').textContent = state.boysScore;

  const girlsScoreEl = $('roundEndGirlsScore');
  const boysScoreEl = $('roundEndBoysScore');
  girlsScoreEl.style.color = state.girlsScore > state.boysScore ? 'var(--pink)' : (state.girlsScore === state.boysScore ? 'var(--gold)' : 'var(--text-dim)');
  boysScoreEl.style.color = state.boysScore > state.girlsScore ? 'var(--blue)' : (state.girlsScore === state.boysScore ? 'var(--gold)' : 'var(--text-dim)');

  $('roundEndOverlay').classList.remove('hidden');

  if (state.girlsScore !== state.boysScore) {
    sfx.win();
    startConfetti();
  } else {
    sfx.end();
  }
}

$('roundEndContinueBtn').addEventListener('click', () => {
  ensureAudio(); sfx.click();
  $('roundEndOverlay').classList.add('hidden');
  stopConfetti();

  state.girlsScore = 0;
  state.boysScore = 0;
  state.currentRound++;
  state.currentQuestion = 0;
  updateScoreDisplay();

  document.querySelectorAll('.score-box').forEach(b => {
    b.classList.remove('filled-girls', 'filled-boys');
    b.textContent = '';
  });

  state.questions = shuffle(state.questions);
  loadQuestion();
});

$('newRoundBtn').addEventListener('click', () => {
  ensureAudio(); sfx.click();
  if (confirm('هل تريد بدء جولة جديدة؟')) {
    stopTimer();
    showScreen('setup');
    stopConfetti();
  }
});

function showResults() {
  showScreen('results');
  $('finalGirlsScore').textContent = state.girlsScore;
  $('finalBoysScore').textContent = state.boysScore;

  let txt = '';
  if (state.girlsScore > state.boysScore) txt = '🎉 الفائز: فريق البنات!';
  else if (state.boysScore > state.girlsScore) txt = '🎉 الفائز: فريق الشباب!';
  else txt = '🤝 تعادل! أداء رائع من الفريقين!';
  $('winnerText').textContent = txt;

  if (state.girlsScore !== state.boysScore) {
    sfx.win();
    startConfetti();
  }
}

$('replayBtn').addEventListener('click', () => {
  ensureAudio(); sfx.click();
  stopConfetti();
  showScreen('setup');
});

document.querySelectorAll('.gift-item').forEach(item => {
  item.addEventListener('click', () => {
    ensureAudio(); sfx.click();
    document.querySelectorAll('.gift-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    const gift = item.dataset.gift;
    handleGift(gift);
    setTimeout(() => item.classList.remove('active'), 1000);
  });
});

function handleGift(gift) {
  switch(gift) {
    case 'tiktok':
      if (state.girlsScore > state.boysScore && state.girlsScore > 0) state.girlsScore--;
      else if (state.boysScore > state.girlsScore && state.boysScore > 0) state.boysScore--;
      else if (state.girlsScore > 0) state.girlsScore--;
      updateScoreDisplay();
      break;
    case 'cat':
      state.girlsScore = Math.min(5, state.girlsScore * 2 || 1);
      updateScoreDisplay();
      break;
    case 'crown':
      state.girlsScore = Math.min(5, state.girlsScore + 1);
      state.boysScore = Math.min(5, state.boysScore + 1);
      updateScoreDisplay();
      break;
    case 'heart':
      showToast('❤️ درع الحماية مفعل!');
      break;
    case 'rose':
      if (state.boysScore > 0) state.boysScore--;
      updateScoreDisplay();
      break;
    case 'donut':
      state.boysScore = Math.min(5, state.boysScore * 2 || 1);
      updateScoreDisplay();
      break;
    case 'corgi':
      state.girlsScore = Math.min(5, state.girlsScore + 1);
      state.boysScore = Math.min(5, state.boysScore + 1);
      updateScoreDisplay();
      break;
  }
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:var(--bg-card);color:var(--gold);padding:12px 24px;border-radius:12px;border:2px solid var(--gold);z-index:1002;font-weight:700;animation:fadeIn 0.3s ease;';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

$('soundToggle').addEventListener('click', () => {
  state.soundOn = !state.soundOn;
  $('soundToggle').textContent = state.soundOn ? '🔊' : '🔇';
  if (state.soundOn) ensureAudio();
});

let confettiAnim = null;
function startConfetti() {
  const canvas = $('confettiCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#ff4d8d', '#4d8dff', '#ffd700', '#2ed573', '#ff4757', '#7eb3ff', '#ff7eb3'];
  for (let i = 0; i < 150; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      speed: Math.random() * 3 + 2,
      rotation: Math.random() * 360,
      rotationSpeed: Math.random() * 4 - 2,
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
      p.y += p.speed;
      p.rotation += p.rotationSpeed;
      if (p.y > canvas.height) { p.y = -20; p.x = Math.random() * canvas.width; }
    });
    confettiAnim = requestAnimationFrame(draw);
  }
  draw();
}

function stopConfetti() {
  if (confettiAnim) { cancelAnimationFrame(confettiAnim); confettiAnim = null; }
  const canvas = $('confettiCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

window.addEventListener('resize', () => {
  const canvas = $('confettiCanvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

document.addEventListener('keydown', e => {
  if (screens.game.classList.contains('hidden')) return;
  switch(e.key) {
    case ' ': e.preventDefault(); $('startTimerBtn').click(); break;
    case 'Enter': e.preventDefault(); $('revealBtn').click(); break;
    case 'ArrowRight': e.preventDefault(); $('nextBtn').click(); break;
    case 'g': case 'G': $('girlsPlusBtn').click(); break;
    case 'b': case 'B': $('boysPlusBtn').click(); break;
  }
});

showScreen('setup');

(() => {
  'use strict';
  const pairs=[
    ['الخطة العلاجية وعرض التكلفة — أفضل عناية','Treatment Plan and Cost Estimate — Best Care'],
    ['الجلسة مطلوبة','Session required'],
    ['سجّل الدخول إلى لوحة أفضل عناية أولًا، ثم افتح الخطة العلاجية من صف المريض.','Sign in to the Best Care dashboard first, then open the treatment plan from the patient row.'],
    ['العودة إلى تسجيل الدخول','Return to sign in'],['أفضل عناية','Best Care'],['← العودة للداشبورد','← Back to dashboard'],
    ['جارٍ تحميل الخطة…','Loading plan…'],['جارٍ تحميل حالة الخطة…','Loading plan status…'],['⚡ إضافة خطة سريعة','⚡ Add Quick Plan'],['＋ إضافة مرحلة','＋ Add stage'],
    ['إدخال سريع','Quick entry'],['إظهار الوثيقة كاملة','Show full document'],['معاينة الطباعة','Print preview'],['حفظ الخطة','Save plan'],
    ['إرسال المسودة للإدارة','Send draft to administration'],['مشاركة مسودة PDF عبر واتساب','Share draft PDF via WhatsApp'],
    ['✍ توقيع المريض على هذا الجهاز','✍ Patient signature on this device'],['اعتماد نهائي للخطة الموقعة','Final approval of signed plan'],
    ['إعادة للعيادة / غير معتمدة','Return to clinic / Not approved'],['طباعة / PDF','Print / PDF'],['إعداد الخطة','Plan preparation'],
    ['المشاركة والمراجعة','Sharing and review'],['توقيع المريض','Patient signature'],['الاعتماد النهائي','Final approval'],
    ['اعتماد المسودة من الطبيب','Doctor draft approval'],['أكمل بيانات الخطة، ثم أكد مراجعتك قبل إرسالها إلى الإدارة لاستكمال الأسعار وموافقة المريض.','Complete the plan, then confirm your review before sending it to administration to complete pricing and patient consent.'],
    ['أؤكد أن بيانات المسودة اكتملت وراجعتها واعتمدتها كطبيب لإرسالها إلى الإدارة.','I confirm that I completed and reviewed this draft and approve sending it to administration.'],
    ['اعتماد الطبيب وإرسال للإدارة','Doctor approval and send to administration'],['✦ ملف علاجي ومالي موحّد','✦ Unified clinical and financial record'],
    ['الخطة العلاجية وعرض التكلفة التقديري','Treatment plan and cost estimate'],
    ['راجع بيانات المريض، رتّب مراحل العلاج، واختر الإجراءات والعدد والتكلفة ثم عاين الورقة قبل الطباعة.','Review patient details, arrange treatment stages, select procedures, quantities, and costs, then preview before printing.'],
    ['مريض جديد','New patient'],['المريض','Patient'],['مراحل العلاج','Treatment stages'],['الحقول المتبقية','Remaining fields'],['صلاحية العرض','Estimate validity'],
    ['جاهزية الخطة','Plan readiness'],['أكمل البيانات الأساسية قبل الطباعة.','Complete the required information before printing.'],['بيانات المريض','Patient details'],
    ['الإجراءات والعدد','Procedures and quantities'],['التكلفة والملخص','Cost and summary'],['المعاينة والطباعة','Preview and print'],['طريقة الإدخال','How to complete the plan'],
    ['راجع بيانات المريض المسحوبة تلقائيًا من قائمة المواعيد.','Review patient details imported automatically from the appointment list.'],
    ['اختر الإجراء وعدّل العدد بأزرار الناقص والزائد، ثم اكتب سعر الوحدة عند الحاجة.','Select a procedure, adjust the quantity, and enter the unit price when needed.'],
    ['عاين الورقة العامة ثم احفظها أو اطبعها PDF.','Preview the document, then save it or print it as PDF.'],['استيراد بيانات JSON','Import JSON data'],
    ['مسار احتياطي لإدخال بيانات المريض والخطة دون رابط.','Backup method for entering patient and plan data without a link.'],['تحليل البيانات','Parse data'],
    ['مسودة','DRAFT'],['مسودة\nللاطلاع','DRAFT\nFOR REVIEW'],['عيادات أفضل عناية الاستشارية للأسنان','Best Care Dental Clinics'],
    ['خطة علاجية وعرض تكلفة تقديري — وإقرار موافقة مستنيرة','Treatment Plan, Cost Estimate, and Informed Consent'],['رقم الخطة:','Plan number:'],
    ['الإصدار:','Revision:'],['تاريخ الإصدار:','Issue date:'],['تاريخ ووقت الطباعة:','Printed at:'],['نسخة المريض','Patient copy'],
    ['الاسم الكامل','Full name'],['رقم الملف','File number'],['رقم الهوية','National ID'],['رقم الجوال','Mobile number'],['بيانات العيادة والزيارة','Clinic and visit details'],
    ['التاريخ والوقت','Date and time'],['اسم المنشأة','Facility name'],['التشخيص والخطة العلاجية','Diagnosis and treatment plan'],
    ['توضح الإجراءات المدرجة في هذه الخطة الاحتياجات العلاجية اللازمة للوصول إلى نتيجة مستقرة وظيفيًا وجماليًا، وتشمل — بحسب حالة المريض — الإجراءات العلاجية والتعويضية والتحفظية اللازمة للمحافظة على صحة الأسنان والأنسجة المحيطة.','The procedures listed in this plan describe the care required to achieve a stable functional and aesthetic result, including the necessary restorative, prosthetic, and conservative treatment for the patient’s condition.'],
    ['الفحوصات والصور الشعاعية','Examinations and imaging'],['الإجراءات التشخيصية','Diagnostic procedures'],
    ['تم استكمال الإجراءات التشخيصية اللازمة للحالة ومراجعة النتائج والملاحظات السريرية، وقد تم أخذ كل ما يلزم من هذه الإجراءات التشخيصية وشرح التشخيص والخطة العلاجية المقترحة للمريض بصورة واضحة.','The required diagnostic procedures, findings, and clinical observations were reviewed, and the diagnosis and proposed treatment plan were explained clearly to the patient.'],
    ['مراحل العلاج والإجراءات والتكلفة','Treatment stages, procedures, and cost'],['الملخص المالي','Financial summary'],['الإجمالي قبل الخصم','Total before discount'],
    ['قيمة الخصم','Discount'],['الإجمالي بعد الخصم','Total after discount'],['ضريبة القيمة المضافة: تتحمّلها الدولة عن المواطن','VAT: covered by the state for eligible citizens'],
    ['الصافي المستحق','Net amount due'],['تنبيه ضريبي — تحقق من أهلية المريض','Tax notice — verify patient eligibility'],['معالجة الضريبة','VAT treatment'],
    ['تتحملها الدولة','Covered by the state'],['ضريبة 15%','15% VAT'],['معفى','Exempt'],['تم التأكد من أهلية هذا المريض واختيار المعالجة الضريبية الصحيحة.','Patient eligibility and the selected VAT treatment have been verified.'],
    ['هذا العرض ساري لمدة 15 يومًا من تاريخ الإصدار.','This estimate is valid for 15 days from the issue date.'],
    ['يتم سداد كامل المبلغ المتفق عليه قبل التركيب النهائي.','The full agreed amount must be paid before final prosthesis delivery.'],
    ['يلتزم المريض بسداد تكلفة كل إجراء يوافق عليه ويتم تنفيذه فعليًا، وفق السعر الموضح في هذه الخطة.','The patient agrees to pay for each approved procedure that is actually performed, at the price shown in this plan.'],
    ['قد تختلف أوقات البدء والانتهاء بحسب المستجدات السريرية واستجابة الحالة.','Start and completion times may change according to clinical findings and patient response.'],
    ['أي إجراء غير مدرج في هذه الخطة يُوثّق ويُسعّر في خطة مستقلة بعد موافقة المريض.','Any procedure not listed in this plan will be documented and priced in a separate plan after patient approval.'],
    ['تخضع الأسعار للتحديث بعد انتهاء مدة صلاحية العرض.','Prices may be updated after the estimate expires.'],['إقرار الموافقة المستنيرة','Informed consent declaration'],
    ['أقر بأن الطبيب شرح لي طبيعة الإجراءات المقترحة وأهدافها بلغة واضحة.','I confirm that the clinician explained the nature and purpose of the proposed procedures clearly.'],
    ['أُتيحت لي فرصة كافية لطرح الأسئلة، وتلقيت إجابات مفهومة عنها.','I had sufficient opportunity to ask questions and received understandable answers.'],
    ['أفهم الفوائد المتوقعة والمخاطر والمضاعفات المحتملة لكل إجراء.','I understand the expected benefits, risks, and possible complications of each procedure.'],
    ['نوقشت معي البدائل العلاجية المتاحة، بما فيها عدم العلاج وعواقبه.','Available treatment alternatives, including no treatment and its consequences, were discussed with me.'],
    ['أفهم أن الاستجابة للعلاج تختلف، ولا يمكن للفريق الطبي ضمان نتيجة نهائية.','I understand that treatment response varies and the clinical team cannot guarantee a final result.'],
    ['أوافق على الالتزام بالتعليمات والمراجعات الدورية والمحافظة على نظافة الفم.','I agree to follow instructions, attend reviews, and maintain oral hygiene.'],
    ['أوافق على ما يلزم داخل حدود الخطة للتعامل مع المستجدات السريرية المبررة.','I agree to clinically justified actions within the scope of this plan.'],
    ['أي إجراء خارج الخطة يحتاج شرحًا وموافقة وخطة تكلفة جديدة.','Any procedure outside this plan requires explanation, consent, and a new cost plan.'],
    ['قرأت الملخص المالي وأفهم أن هذه الوثيقة عرض تقديري وليست فاتورة ضريبية.','I have read the financial summary and understand that this document is an estimate, not a tax invoice.'],
    ['أوافق على سداد تكاليف الإجراءات التي أوافق عليها ويتم تنفيذها فعليًا وفق الأسعار الموضحة.','I agree to pay for approved procedures that are actually performed at the stated prices.'],
    ['أوافق على بدء العلاج وفق المراحل الموضحة بعد توقيعي وتوثيق الموافقة.','I agree to begin treatment according to the listed stages after signing and documenting my consent.'],
    ['أوافق اختياريًا على التصوير واستخدام الصور الطبية لغرض توثيق ومراجعة وضبط جودة النتيجة العلاجية، ولأغراض علمية وتعليمية بعد إخفاء الهوية. هذه الموافقة مستقلة وليست شرطًا للعلاج، ويمكن إلغاء اختيارها قبل الاعتماد.','I optionally consent to clinical photography for documentation, review, treatment-quality assurance, and de-identified scientific and educational use. This consent is independent, is not a condition of treatment, and may be withdrawn before approval.'],
    ['التواقيع والاعتماد','Signatures and approval'],['توقيع المريض أو الوصي','Patient or guardian signature'],['إقرار بالاطلاع والموافقة على الخطة العلاجية والتكلفة التقديرية','Confirmation of review and consent to the treatment plan and estimated cost'],
    ['استخدام التوقيع الإلكتروني','Use electronic signature'],['مسح','Clear'],['تثبيت','Confirm'],['اسم الموقّع','Signer name'],['التوقيع أعلاه','Signature above'],['التاريخ:','Date:'],
    ['اعتماد العيادة','Clinic approval'],['يُستكمل بعد موافقة المريض والاعتماد النهائي','Completed after patient consent and final approval'],['معتمد','APPROVED'],
    ['ختم الاعتماد الرسمي','Official approval seal'],['تاريخ الاعتماد:','Approval date:'],
    ['هذه الوثيقة خطة علاجية وعرض تكلفة تقديري، وليست فاتورة ضريبية. تُصدر الفاتورة النظامية بعد تنفيذ الخدمة.','This document is a treatment plan and cost estimate, not a tax invoice. The official invoice is issued after service delivery.'],
    ['تحتوي هذه الوثيقة على بيانات صحية شخصية — يرجى التعامل معها بسرية.','This document contains personal health information and must be handled confidentially.'],
    ['· صفحة 1','· Page 1'],['واتساب PDF','WhatsApp PDF'],['طباعة PDF','Print PDF'],['صورة المسودة جاهزة','Draft image ready'],
    ['راجع الصورة ثم افتح مشاركة الجهاز واختر واتساب.','Review the image, then open device sharing and choose WhatsApp.'],['نسخ رابط التوقيع','Copy signature link'],
    ['تنزيل نسخة','Download copy'],['فتح واتساب ومشاركة الصورة','Open WhatsApp and share image'],['٢ — إرسال رابط التوقيع منفصلًا عبر واتساب','2 — Send signature link separately via WhatsApp'],
    ['الترتيب','Order'],['إضافة لاحقًا','Add later'],['إضافة الآن','Add now'],['حذف المرحلة','Delete stage'],['فتح المرحلة','Expand stage'],['طي المرحلة','Collapse stage'],
    ['الإجراء','Procedure'],['العدد','Quantity'],['قبل الخصم','Before discount'],['بعد الخصم','After discount'],['الإجمالي','Total'],['إجراء','Action'],
    ['اختر الإجراء','Select procedure'],['إنقاص العدد','Decrease quantity'],['زيادة العدد','Increase quantity'],['مجاني','Included'],['مدفوع','Paid'],['حذف','Delete'],
    ['＋ إضافة إجراء','＋ Add procedure'],['هذه المرحلة محددة للاستكمال لاحقًا، ويمكن فتحها وإضافة الإجراءات في أي وقت.','This stage is marked for later completion and can be reopened to add procedures at any time.'],
    ['المعالجات الأولية','Preliminary treatment'],['تهيئة الحالة ومعالجة الأسنان والأنسجة قبل الزراعة','Prepare the teeth and tissues before implant treatment'],
    ['الجراحة والزراعة','Surgery and implants'],['الإجراءات الجراحية ومراحل وضع وتجهيز الزراعة','Surgical procedures and implant placement stages'],
    ['التركيبات','Prosthetics'],['المراحل التعويضية والتركيبات المؤقتة والنهائية','Prosthetic stages and temporary and final restorations'],
    ['لغة الخطة والمشاركة','Plan and sharing language'],['العربية','Arabic'],['الإنجليزية','English'],
    ['مراجعة وتوقيع الخطة العلاجية | أفضل عناية','Review and Sign Treatment Plan | Best Care'],
    ['شعار عيادات أفضل عناية','Best Care Dental Clinics logo'],['مراجعة وتوقيع الخطة العلاجية','Review and sign treatment plan'],
    ['رابط خاص وآمن يبقى صالحًا حتى التوقيع أو تحديث الخطة','A private secure link that remains valid until the plan is signed or updated'],
    ['جارٍ تحميل الخطة المعتمدة من الطبيب…','Loading the treatment plan…'],['تعذر فتح رابط التوقيع','Unable to open the signature link'],
    ['تحقق من اتصال الإنترنت ثم أعد المحاولة.','Check your internet connection and try again.'],['إعادة تحميل الخطة','Reload plan'],
    ['تم توقيع الخطة بنجاح','The plan was signed successfully'],['وصلت موافقتك إلى العيادة، وأصبحت الخطة معتمدة وموقعة. يمكنك إغلاق هذه الصفحة.','Your consent reached the clinic and the plan is now approved and signed. You may close this page.'],
    ['الخطة العلاجية المعتمدة من الطبيب','Treatment plan prepared by the clinic'],['الخطة العلاجية','Treatment plan'],['رقم الخطة','Plan number'],
    ['الإصدار','Revision'],['تاريخ الخطة','Plan date'],['الطبيب','Clinician'],['النسخة التي ستوقّع عليها','The copy you will sign'],
    ['ملخص الخطة والإجراءات','Plan and procedure summary'],['نسخة ثابتة','Locked copy'],['الصافي بعد الخصم','Net after discount'],
    ['توثيق الموافقة','Consent documentation'],['الإقرار والتوقيع','Declaration and signature'],['إلزامي','Required'],['قبل التوقيع','Before signing'],
    ['راجع الخطة والأسعار والبنود التالية. هذه الموافقة توثّق النسخة التي أعدتها العيادة وفق المعلومات والتوجيهات العلاجية المسجلة، ولا تستبدل الشرح السريري أو حقك في السؤال وطلب التوضيح قبل تنفيذ أي إجراء.','Review the plan, prices, and terms below. This consent documents the copy prepared by the clinic from the recorded clinical information and instructions; it does not replace clinical explanation or your right to ask questions before any procedure.'],
    ['الشروط والأحكام','Terms and conditions'],['الشروط المالية والتنفيذية','Financial and implementation terms'],
    ['يتم سداد كامل المبلغ المستحق والمتفق عليه قبل التركيب النهائي.','The full agreed amount due must be paid before final prosthesis delivery.'],
    ['أي إجراء غير مدرج في هذه الخطة يحتاج شرحًا وموافقة، ويوثّق ويُسعّر في خطة مستقلة قبل تنفيذه.','Any procedure not listed in this plan requires explanation and consent and will be documented and priced in a separate plan before treatment.'],
    ['بنود الموافقة المستنيرة','Informed consent terms'],['أفهم أن لي حق طلب التوضيح أو رفض إجراء قبل تنفيذه، مع شرح الآثار المترتبة على ذلك.','I understand that I may request clarification or refuse a procedure before it is performed after the consequences are explained.'],
    ['اطلعت على الخطة المعروضة أعلاه وفهمت محتواها.','I reviewed the plan shown above and understand its content.'],
    ['أوافق على تنفيذ الخطة العلاجية وفق الإجراءات والأسعار الموضحة.','I consent to the treatment plan according to the listed procedures and prices.'],
    ['التزام مالي:','Financial commitment:'],['أوافق على سداد تكلفة الإجراءات التي أوافق عليها ويتم تنفيذها فعليًا وفق الأسعار الموضحة، وأفهم أن أي إجراء إضافي يتطلب موافقة وتسعيرًا مستقلًا.','I agree to pay for approved procedures that are actually performed at the stated prices, and I understand that any additional procedure requires separate consent and pricing.'],
    ['موافقة تصوير اختيارية:','Optional photography consent:'],['أوافق على التصوير واستخدام الصور الطبية لغرض توثيق ومراجعة وضبط جودة النتيجة العلاجية، ولأغراض علمية وتعليمية بعد إخفاء الهوية. هذه الموافقة مستقلة وليست شرطًا للعلاج، ويمكن إلغاء اختيارها قبل إرسال التوقيع.','I consent to clinical photography for documentation, review, treatment-quality assurance, and de-identified scientific and educational use. This consent is independent, is not a condition of treatment, and may be withdrawn before submitting the signature.'],
    ['صفة الموقّع','Signer role'],['المريض نفسه','Patient'],['ولي الأمر أو الوصي','Parent or guardian'],['الاسم الكامل للموقّع','Signer full name'],
    ['اكتب الاسم الكامل','Enter the full name'],['صلة القرابة أو الصفة','Relationship or capacity'],['مثال: الأب، الأم، الوصي','Example: father, mother, guardian'],
    ['وقّع داخل المربع بإصبعك أو القلم','Sign inside the box using your finger or stylus'],['مساحة توقيع المريض','Patient signature area'],
    ['لم يتم إدخال التوقيع بعد','No signature entered yet'],['مسح التوقيع','Clear signature'],['تأكيد الموافقة وإرسال التوقيع','Confirm consent and submit signature'],
    ['عند الإرسال تُربط الموافقة بهذه النسخة تحديدًا ويُسجل وقت التوقيع في ملف الخطة. لا تشارك هذا الرابط مع أي شخص.','On submission, consent is linked to this exact copy and the signing time is recorded in the plan. Do not share this link with anyone.'],
    ['هذا العرض ساري لمدة','This estimate is valid for'],['يومًا من تاريخ الإصدار، وتخضع الأسعار للتحديث بعد انتهاء مدة الصلاحية.','days from the issue date, and prices may be updated after it expires.'],
    ['قبل الخصم:','Before discount:'],['بعد الخصم:','After discount:'],['اختر النوع','Select type'],['بتحضير','With preparation'],['بدون تحضير','Without preparation'],['اكتب الإجراء','Enter procedure']
    ,['أدوات الخطة العلاجية','Treatment plan tools'],['حالة اعتماد الخطة','Plan approval status'],['لوحة إعداد الخطة','Plan editor'],['وثيقة الخطة العلاجية','Treatment plan document'],
    ['مسودة جديدة','New draft'],['الفحوصات والصور','IMAGING'],['التواقيع','SIGNATURES'],['الموافقة المستنيرة','INFORMED CONSENT'],['نظام عيادات أفضل عناية','BEST CARE CLINIC FLOW'],
    ['👤 بيانات المريض','👤 Patient details'],['▦ مراحل العلاج','▦ Treatment stages'],['🦷 الإجراءات والعدد','🦷 Procedures and quantities'],['﷼ التكلفة والملخص','SAR Cost and summary'],['👁 المعاينة والطباعة','👁 Preview and print'],
    ['عيادات أفضل عناية — أبها','Best Care Dental Clinics — Abha'],['شعار عيادات أفضل عناية الاستشارية للأسنان','Best Care Dental Clinics logo'],
    ['إجراءات الخطة السريعة','Quick plan actions'],['الفحوصات الشعاعية','Radiographic examinations'],['مثال: أشعة بانورامية، أشعة ذروية','Example: panoramic or periapical imaging'],
    ['ختم معتمد من عيادات أفضل عناية الاستشارية للأسنان','Approved Best Care Dental Clinics seal'],['مشاركة الخطة عبر واتساب','Share plan via WhatsApp'],['طباعة الخطة أو حفظها PDF','Print plan or save as PDF'],
    ['معاينة صورة مسودة الخطة','Treatment-plan draft image preview'],['بيانات JSON','JSON data'],['اختيار الإجراء في المرحلة','Select procedure in stage'],['عدد الإجراءات','Procedure quantity']
  ];
  const arToEn=new Map(pairs),enToAr=new Map(pairs.map(([ar,en])=>[en,ar]));
  [['PATIENT','المريض'],['CLINIC & VISIT','العيادة والزيارة'],['TREATMENT PHASES','مراحل العلاج'],['FINANCIAL SUMMARY','الملخص المالي'],['CLINICAL SUMMARY','الملخص السريري'],['BEST CARE','أفضل عناية']].forEach(([en,ar])=>enToAr.set(en,ar));
  [['العيادة والزيارة','CLINIC & VISIT'],['الملخص السريري','CLINICAL SUMMARY']].forEach(([ar,en])=>arToEn.set(ar,en));
  const exact=(value,lang)=>{
    const text=String(value??''),trimmed=text.trim();
    const translated=(lang==='en'?arToEn:enToAr).get(trimmed);
    return translated?text.replace(trimmed,translated):text;
  };
  const apply=(root,lang='ar')=>{
    if(!root)return;
    const doc=root.ownerDocument||document;
    doc.documentElement.lang=lang==='en'?'en':'ar-SA';
    doc.documentElement.dir=lang==='en'?'ltr':'rtl';
    if(root===doc||root===doc.documentElement||root===doc.body)doc.title=lang==='en'?arToEn.get('الخطة العلاجية وعرض التكلفة — أفضل عناية'):'الخطة العلاجية وعرض التكلفة — أفضل عناية';
    const walker=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){
      return /^(SCRIPT|STYLE|TEXTAREA|CANVAS)$/.test(node.parentElement?.tagName||'')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;
    }});
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(node=>{node.nodeValue=exact(node.nodeValue,lang)});
    const elements=root.querySelectorAll?root.querySelectorAll('[aria-label],[placeholder],[title],[alt]'):[];
    elements.forEach(element=>['aria-label','placeholder','title','alt'].forEach(name=>{
      if(element.hasAttribute(name))element.setAttribute(name,exact(element.getAttribute(name),lang));
    }));
  };
  window.BestCareTreatmentPlanI18n=Object.freeze({apply,exact});
})();

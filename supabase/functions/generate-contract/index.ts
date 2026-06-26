// Marketing iO — generate-contract Edge Function
// MSA V3.0 DOCX generator. Logo fetched from brand-assets Storage at runtime.
// Uploads draft.docx to contracts/{contract_id}/draft.docx, writes back to contracts row.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  Footer, AlignmentType, BorderStyle, WidthType, ShadingType, PageBreak, PageNumber, TabStopType,
} from 'npm:docx@9'

const NAVY = '0B2143', RED = 'E2293B', GREY = '6B7280', LIGHT = 'F5F7FB'
const BORDER_CCC = { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' }
const cellBorders = { top: BORDER_CCC, bottom: BORDER_CCC, left: BORDER_CCC, right: BORDER_CCC }
const cellPad = { top: 80, bottom: 80, left: 140, right: 140 }

// deno-lint-ignore no-explicit-any
type AnyObj = Record<string, any>

const P = (text: string, opts: AnyObj = {}) => new Paragraph({
  spacing: { after: opts.after ?? 120, line: 280 },
  alignment: opts.alignment ?? AlignmentType.LEFT,
  children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, color: opts.color, size: opts.size ?? 20, font: 'Calibri' })]
})
const H1 = (t: string) => new Paragraph({ spacing: { before: 240, after: 180 }, children: [new TextRun({ text: t, bold: true, color: NAVY, size: 32, font: 'Calibri' })] })
const H2 = (t: string) => new Paragraph({ spacing: { before: 200, after: 100 }, children: [new TextRun({ text: t, bold: true, color: NAVY, size: 24, font: 'Calibri' })] })
const H3 = (t: string) => new Paragraph({ spacing: { before: 140, after: 80 }, children: [new TextRun({ text: t, bold: true, color: NAVY, size: 22, font: 'Calibri' })] })
const SUB = (t: string) => new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: t, bold: true, color: GREY, size: 18, font: 'Calibri' })] })
const SPACER = (after = 120) => new Paragraph({ spacing: { after }, children: [new TextRun('')] })
const PAGEBREAK = () => new Paragraph({ children: [new PageBreak()] })

const CALLOUT = (label: string, body: string, fill = 'FFF4E6') => new Table({
  width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
  rows: [new TableRow({ children: [new TableCell({
    borders: { top: { style: BorderStyle.SINGLE, size: 12, color: RED }, bottom: BORDER_CCC, left: BORDER_CCC, right: BORDER_CCC },
    shading: { fill, type: ShadingType.CLEAR }, width: { size: 9360, type: WidthType.DXA }, margins: cellPad,
    children: [
      new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: label, bold: true, color: RED, size: 22, font: 'Calibri' })] }),
      new Paragraph({ spacing: { after: 0, line: 280 }, children: [new TextRun({ text: body, size: 20, font: 'Calibri' })] })
    ]
  })] })]
})

const defRow = (term: string, def: string) => new TableRow({ children: [
  new TableCell({ borders: cellBorders, width: { size: 2400, type: WidthType.DXA }, margins: cellPad, shading: { fill: LIGHT, type: ShadingType.CLEAR },
    children: [new Paragraph({ children: [new TextRun({ text: `"${term}"`, bold: true, size: 20, font: 'Calibri' })] })] }),
  new TableCell({ borders: cellBorders, width: { size: 6960, type: WidthType.DXA }, margins: cellPad,
    children: [new Paragraph({ spacing: { line: 280 }, children: [new TextRun({ text: def, size: 20, font: 'Calibri' })] })] })
]})

const initialsFooter = () => new Table({
  width: { size: 9360, type: WidthType.DXA }, columnWidths: [3120, 3120, 3120],
  rows: [new TableRow({ children: [
    new TableCell({ borders: { top: { style: BorderStyle.SINGLE, size: 4, color: NAVY }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      width: { size: 3120, type: WidthType.DXA }, margins: { top: 60, bottom: 0, left: 0, right: 0 },
      children: [new Paragraph({ children: [new TextRun({ text: 'Marketing iO initials:  __________   Client initials:  __________', size: 16, color: GREY, font: 'Calibri' })] })] }),
    new TableCell({ borders: { top: { style: BorderStyle.SINGLE, size: 4, color: NAVY }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      width: { size: 3120, type: WidthType.DXA }, margins: { top: 60, bottom: 0, left: 0, right: 0 },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: 'Marketing iO (Pty) Ltd · MSA V3.0 · Page ', size: 16, color: GREY, font: 'Calibri' }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY, font: 'Calibri' }),
        new TextRun({ text: ' of ', size: 16, color: GREY, font: 'Calibri' }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: GREY, font: 'Calibri' })
      ] })] }),
    new TableCell({ borders: { top: { style: BorderStyle.SINGLE, size: 4, color: NAVY }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      width: { size: 3120, type: WidthType.DXA }, margins: { top: 60, bottom: 0, left: 0, right: 0 },
      children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Initialled by both Parties', size: 16, color: GREY, italics: true, font: 'Calibri' })] })] })
  ]})]
})

const sigBlock = (heading: string, party: string) => {
  const line = (lbl: string) => new Paragraph({ spacing: { after: 220 }, children: [
    new TextRun({ text: `${lbl}: `, bold: true, size: 20, font: 'Calibri' }),
    new TextRun({ text: '_____________________________________________________________________', size: 20, font: 'Calibri' })
  ]})
  return [
    new Paragraph({ spacing: { before: 120, after: 100 }, children: [new TextRun({ text: heading, bold: true, color: NAVY, size: 22, font: 'Calibri' })] }),
    P(`For and on behalf of: ${party}`, { after: 160, bold: true }),
    line('Signed'), line('Name in print'), line('Capacity'), line('Date'), line('Place'),
    line('Witness 1 — Name & signature'), line('Witness 2 — Name & signature')
  ]
}

const fmtZar = (n: number) => 'R' + n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function getPackageMeta(code: string, setup: number, monthly: number): AnyObj {
  const fs = fmtZar(setup), fm = fmtZar(monthly)
  const base: AnyObj = {
    ignite: { part:2, name:'IGNITE PACKAGE', setup:fs, monthly:fm, term:'Twelve (12) months from Effective Date',
      setupItems:['Brand kit standardisation (colours, fonts, logo file). Basic wordmark logo in Canva if the Client has none.','One-page mobile-responsive website with up to five (5) sections, hosted on Marketing iO infrastructure.','Domain registration of one (1) .co.za domain in the Client\'s name.','One (1) professional business email address on the Client\'s domain.','Google Business Profile creation, verification, photos, and category setup.','Social media setup: Facebook business page and Instagram business account, branded.','Initial content batch: six (6) launch posts loaded across Facebook and Instagram.'],
      recurring:['Eight (8) social media posts per month across Facebook and Instagram.','Hosting, domain, and email maintenance: uptime, security, backups.','Monthly performance report by the fifth (5th) of the following month via WhatsApp.','One (1) content revision request per month at no additional charge.'],
      timeline:'Days 1–6: Setup Fee clears. Day 7: Onboarding call. Days 8–14: Domain, email, hosting provisioned. Days 15–21: Website built, social pages set up, GBP submitted. Days 22–25: Client review window. Days 26–30: Launch.',
      sla:'Go-Live within thirty (30) calendar days of Setup-Fee clearance (soft SLA); within forty-five (45) calendar days (hard SLA).',
      clientObs:['Provide brand assets within seven (7) Business Days of onboarding call.','Approve or revise drafts within five (5) Business Days; silence constitutes approval.','Provide login access to existing Facebook and Google accounts where applicable.'],
      exclusions:['More than one (1) page on the website.','E-commerce or payment integration.','Paid advertising creation or management.','Video content of any kind.','Custom photography or photo shoots.','More than eight (8) posts per month.','More than one (1) revision per month.','TikTok, LinkedIn, or YouTube management.'],
      signoff:'Acceptance shall be deemed to occur upon the website going live and the first content batch being published. The Client shall sign a Go-Live Acknowledgement (Part 9).' },
    accelerate: { part:3, name:'ACCELERATE PACKAGE', setup:fs, monthly:fm, term:'Twelve (12) months from Effective Date',
      setupItems:['Brand kit standardisation. Basic logo design if Client has none.','Multi-page mobile-responsive website with three to five (3–5) pages.','E-commerce-ready catalog: up to twenty (20) listings (display only — no payment gateway).','Domain registration of one (1) .co.za domain.','Two (2) professional business email addresses on the Client\'s domain.','Google Business Profile creation and full setup.','Google Ads account creation with conversion tracking (setup only).','Social media setup: Facebook, Instagram, and LinkedIn business pages.','Email signatures designed for owner and up to two (2) staff.','Initial content batch: eight (8) launch posts.'],
      recurring:['Twelve (12) social media posts per month across Facebook, Instagram, and LinkedIn.','Hosting, domain, and email maintenance.','Monthly performance report by the fifth (5th) of the following month.','Two (2) content revision requests per month at no additional charge.','Quarterly fifteen (15) minute strategy call with the Marketing iO Founder.'],
      timeline:'Days 1–6: Setup Fee clears. Day 7: Onboarding call. Days 8–28: Multi-page site, social, GBP. Days 29–34: Client review. Days 35–40: Launch.',
      sla:'Go-Live within forty (40) calendar days of Setup-Fee clearance (soft SLA); within sixty (60) calendar days (hard SLA).',
      clientObs:['Provide brand assets within seven (7) Business Days of onboarding.','Provide product or service catalog information.','Approve or revise drafts within five (5) Business Days; silence constitutes approval.'],
      exclusions:['Payment gateway integration — available as E-commerce Setup add-on.','More than five (5) pages on the website.','More than twelve (12) posts per month.','Video content — available as Short-Form Video Pack add-on.','Paid ads management — available as Paid Ads Management add-on.','TikTok management.'],
      signoff:'Acceptance shall be deemed to occur upon the website going live, social pages activated, and signature elements delivered. The Client shall sign a Go-Live Acknowledgement (Part 9).' },
    dominate: { part:4, name:'DOMINATE PACKAGE', setup:fs, monthly:fm, term:'Twelve (12) months from Effective Date',
      setupItems:['Brand kit standardisation. Logo design if Client has none.','Multi-page website with up to ten (10) pages.','Domain registration of one (1) .co.za domain.','Four (4) professional business email addresses.','Google Business Profile — full setup with photos and posts.','Google Ads account setup, one (1) campaign launched for first month.','Meta Ads account setup, one (1) campaign launched for first month.','Blog architecture plus three (3) launch articles, SEO-optimised.','Lead capture forms plus a five (5) email automated welcome sequence.','Social media setup: Facebook, Instagram, and LinkedIn.','Branded business cards — design plus printing of two hundred (200) cards.','Initial content batch: twelve (12) launch posts.'],
      recurring:['Sixteen (16) social media posts per month across Facebook, Instagram, and LinkedIn.','Two (2) SEO-optimised blog articles per month (800–1,200 words each).','Hosting, domain, and email maintenance.','Comprehensive monthly performance report.','Four (4) content revision requests per month at no additional charge.','Monthly fifteen (15) minute strategy call with the Marketing iO Founder.'],
      timeline:'Days 1–6: Setup Fee clears. Day 7: Onboarding call. Days 8–14: Infrastructure. Days 15–45: Build. Days 46–55: Review + printing. Days 56–60: Launch.',
      sla:'Go-Live within sixty (60) calendar days of Setup-Fee clearance (soft SLA); within ninety (90) calendar days (hard SLA).',
      clientObs:['Provide brand assets and content within seven (7) Business Days of onboarding.','Provide login access to existing Google, Meta, and WhatsApp Business accounts.','Fund advertising spend on Google Ads and Meta Ads directly with those platforms.','Approve or revise drafts within five (5) Business Days; silence constitutes approval.'],
      exclusions:['More than ten (10) pages on the website.','E-commerce or payment gateway — available as E-commerce Setup add-on (R4,500).','More than sixteen (16) posts or two (2) articles per month.','Video content — available as Short-Form Video Pack add-on.'],
      signoff:'Acceptance shall be deemed to occur upon all setup deliverables being live or delivered. The Client shall sign a Go-Live Acknowledgement (Part 9).' },
    street_pulse: { part:5, name:'STREET PULSE PACKAGE', setup:fs, monthly:fm, term:'Three (3) months locked term from Effective Date',
      setupItems:['Custom branded flyer design — one (1) A5 double-sided full-colour version.','Flyer printing: 2,500 flyers, sufficient for the three (3) month deployment cycle.','Two (2) branded t-shirts in the Client\'s brand colours and logo.','Deployment-zone agreement: Client approves the high-traffic zones.','Twelve (12) week deployment calendar mapped (4 days per month × 3 months).'],
      recurring:['Two (2) part-time deployment agents in branded shirts, four (4) days per month.','Two hundred and fifty (250) flyers distributed per session.','One thousand (1,000) flyers distributed per month.','Branded transport: dedicated driver and seven-seater vehicle.','Same-day photo evidence via WhatsApp.','Compiled monthly photo report by the fifth (5th) of the following month.'],
      timeline:'Days 1–6: Setup payment clears. Day 7: Brief call. Days 8–14: Flyer design, printing. Day 14: Calendar shared. Day 15: First deployment.',
      sla:'First deployment within fifteen (15) calendar days of Setup-payment clearance (soft SLA); within twenty-one (21) calendar days (hard SLA).',
      clientObs:['Provide brand assets within three (3) Business Days of brief call.','Approve flyer design within forty-eight (48) hours; silence after seventy-two (72) hours constitutes approval.','Confirm deployment zones in writing.'],
      exclusions:['More than 250 flyers per session.','More than four (4) deployment days per month.','Door-to-door delivery.','Mall-internal deployment.','Sales-conversion tracking.'],
      signoff:'Acceptance shall be deemed to occur upon completion of the first deployment and delivery of photo evidence.' },
    township_pulse: { part:6, name:'TOWNSHIP PULSE PACKAGE', setup:`${fs} once-off, payable in full at signature`, monthly:'Not applicable — once-off campaign', term:'Once-off campaign — single deployment day, no ongoing commitment',
      setupItems:['Brief gathering: brand assets, target township zone, key messaging.','Custom flyer design — one (1) A5 double-sided full-colour version.','Five (5) A2 posters designed.','Three hundred (300) flyers printed.','Five (5) A2 posters printed.'],
      recurring:['One (1) part-time deployment agent in branded shirt, deployed for one (1) full day.','Driver plus vehicle for transport and supervision.','Three hundred (300) flyers distributed hand-to-hand at taxi ranks and spaza-cluster areas.','Five (5) posters mounted at high-traffic spots within the deployment zone.','Compiled photo report via WhatsApp within seven (7) days of deployment.'],
      timeline:'Days 1–4: Payment clears. Day 5: Brief call. Days 6–8: Design. Day 9: Approval. Days 10–11: Printing. Days 12–14: Deployment day. Day 15: Photo report sent.',
      sla:'Deployment within fourteen (14) calendar days of payment clearance (soft SLA); within twenty-one (21) calendar days (hard SLA).',
      clientObs:['Provide brand assets within three (3) Business Days of brief call.','Approve design within twenty-four (24) hours of presentation.','Confirm preferred township zone in writing.','Pay the fee in full at signature (no debit order — once-off).'],
      exclusions:['More than 300 flyers.','More than five (5) posters.','More than one (1) deployment day.','Multiple deployment zones.','Repeat campaigns — each constitutes a new booking.'],
      signoff:'Acceptance shall be deemed to occur upon delivery of the photo report. Clause 4.12 (No Refunds) and clause 8.1 (Cooling-Off where applicable) apply.' }
  }
  return base[code.toLowerCase()] ?? base.ignite
}

async function buildDocument(client: AnyObj, deal: AnyObj, effectiveDate: string, logoBytes: Uint8Array | null): Promise<Document> {
  const setup = Number(deal.setup_fee), monthly = Number(deal.monthly_retainer)
  const s = getPackageMeta(String(deal.package ?? 'ignite'), setup, monthly)
  // deno-lint-ignore no-explicit-any
  const ch: any[] = []

  // COVER
  if (logoBytes) {
    ch.push(new Paragraph({ spacing: { before: 1200, after: 200 }, alignment: AlignmentType.CENTER,
      children: [new ImageRun({ data: logoBytes, transformation: { width: 360, height: 85 }, type: 'png' })] }))
  } else {
    ch.push(new Paragraph({ spacing: { before: 1200, after: 200 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'MARKETING iO (PTY) LTD', bold: true, color: NAVY, size: 36, font: 'Calibri' })] }))
  }
  ch.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'Too good to stay hidden.', italics: true, color: RED, size: 24, font: 'Calibri' })] }))
  ch.push(SPACER(600))
  ch.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: 'MASTER SERVICE AGREEMENT', bold: true, color: NAVY, size: 36, font: 'Calibri' })] }))
  ch.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'Schedule A · POPIA Operator Agreement', size: 22, color: GREY, font: 'Calibri' })] }))
  ch.push(SPACER(400))

  ch.push(new Table({ width: { size: 7200, type: WidthType.DXA }, columnWidths: [2400, 4800], alignment: AlignmentType.CENTER,
    rows: [['Company','Marketing iO (Pty) Ltd'],['CIPC Reg. No.','2026/303502/07'],['Registered Address','75 Marshall Street, Polokwane 0699'],['Email','info@marketingio.co.za'],['Status','Final — legal review complete'],['Effective', effectiveDate],['Version','3.0']]
    .map(([k,v]) => new TableRow({ children: [
      new TableCell({ borders: cellBorders, shading: { fill: LIGHT, type: ShadingType.CLEAR }, width: { size: 2400, type: WidthType.DXA }, margins: cellPad, children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, size: 20, font: 'Calibri' })] })] }),
      new TableCell({ borders: cellBorders, width: { size: 4800, type: WidthType.DXA }, margins: cellPad, children: [new Paragraph({ children: [new TextRun({ text: v, size: 20, font: 'Calibri' })] })] })
    ]}))
  }))
  ch.push(SPACER(400))
  ch.push(CALLOUT('EXECUTION NOTES', 'This Agreement is to be initialled by both Parties on every page and signed in full at the signature blocks. Counterparts and electronic signatures are valid in terms of clause 15.9.'))
  ch.push(PAGEBREAK())

  // CONTENTS
  ch.push(H1('Document Contents'))
  ;[['Part 1','Master Service Agreement (16 clauses)'],[`Part ${s.part}`,`Schedule A — ${s.name.replace(' PACKAGE','')}`],['Part 7','POPIA Operator Agreement'],['Part 8','Schedule B — Debit Order Mandate'],['Part 9','Go-Live & Onboarding Acknowledgements']]
  .forEach(([p,t]) => ch.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: `${p}   `, bold: true, color: NAVY, size: 20, font: 'Calibri' }), new TextRun({ text: t, size: 20, font: 'Calibri' })] })))
  ch.push(PAGEBREAK())

  // PART 1
  ch.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'PART 1', bold: true, color: GREY, size: 18, font: 'Calibri' })] }))
  ch.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: 'MASTER SERVICE AGREEMENT', bold: true, color: NAVY, size: 32, font: 'Calibri' })] }))
  ch.push(P('This Master Service Agreement ("Agreement") is entered into between Marketing iO (Pty) Ltd and the Client identified below.', { after: 240 }))

  ch.push(new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [4680, 4680],
    rows: [
      new TableRow({ children: [
        new TableCell({ borders: cellBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, width: { size: 4680, type: WidthType.DXA }, margins: cellPad, children: [new Paragraph({ children: [new TextRun({ text: 'SERVICE PROVIDER', bold: true, color: 'FFFFFF', size: 20, font: 'Calibri' })] })] }),
        new TableCell({ borders: cellBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, width: { size: 4680, type: WidthType.DXA }, margins: cellPad, children: [new Paragraph({ children: [new TextRun({ text: 'CLIENT', bold: true, color: 'FFFFFF', size: 20, font: 'Calibri' })] })] })
      ]}),
      new TableRow({ children: [
        new TableCell({ borders: cellBorders, width: { size: 4680, type: WidthType.DXA }, margins: cellPad, children: [
          P('Marketing iO (Pty) Ltd', { bold: true, after: 60 }), P('Reg. No. 2026/303502/07', { after: 60 }), P('75 Marshall Street, Polokwane 0699', { after: 60 }), P('Email: info@marketingio.co.za', { after: 60 }), P('("Marketing iO" or "the Provider")', { italics: true, color: GREY, after: 0 })
        ]}),
        new TableCell({ borders: cellBorders, width: { size: 4680, type: WidthType.DXA }, margins: cellPad, children: [
          P(`Trading Name: ${client.business_name}`, { bold: true, after: 100 }),
          P(`Reg. No. / ID No.: ${client.id_reg_number ?? '(to be completed at signing)'}`, { after: 100 }),
          P(`Address: ${client.address ?? '(to be completed at signing)'}`, { after: 100 }),
          P(`Phone: ${client.phone ?? ''}  WhatsApp: ${client.whatsapp_number ?? ''}`, { after: 100 }),
          P(`Email: ${client.email ?? ''}`, { after: 60 }),
          P(`Authorised Signatory: ${client.contact_person}`, { after: 60 }),
          P('("the Client")', { italics: true, color: GREY, after: 0 })
        ]})
      ]})
    ]
  }))
  ch.push(SPACER(160))
  ch.push(P('(Marketing iO and the Client are referred to collectively as the "Parties" and individually as a "Party".)', { italics: true, color: GREY, after: 200 }))

  ch.push(H2('PREAMBLE'))
  ch.push(P('WHEREAS Marketing iO operates a full-service digital marketing and field-marketing agency providing website design, social media management, brand activation, paid media support, township and street activation, and related services to small and medium enterprises in South Africa;'))
  ch.push(P('AND WHEREAS the Client wishes to engage Marketing iO to provide the services described in the Schedule A attached to this Agreement;'))
  ch.push(P('NOW THEREFORE the Parties agree as follows:', { bold: true, after: 200 }))

  ch.push(H2('1. DEFINITIONS AND INTERPRETATION'))
  ch.push(P('1.1 In this Agreement, unless the context indicates otherwise, the following terms shall have the meanings assigned below:'))
  ch.push(new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [2400, 6960], rows: [
    defRow('Business Day','Any day other than a Saturday, Sunday, or official public holiday in the Republic of South Africa.'),
    defRow('Cooling-Off Period','A period of five (5) Business Days from the Effective Date during which the Client may, by written notice, withdraw from this Agreement without penalty. No Cooling-Off Period applies where the Agreement is concluded in person or where the Client is not a "consumer" under the CPA.'),
    defRow('CPA','The Consumer Protection Act 68 of 2008, as amended.'),
    defRow('Deliverables','All materials, designs, websites, content, configurations, deployments, photographs, reports, and other tangible outputs produced or performed by Marketing iO for the Client under this Agreement, as described in Schedule A.'),
    defRow('Effective Date','The date upon which this Agreement is signed by both Parties, or the date the Setup Fee is received in cleared funds, whichever is earlier.'),
    defRow('Initial Term','The initial fixed term of the Agreement as specified in Schedule A.'),
    defRow('POPIA','The Protection of Personal Information Act 4 of 2013, as amended.'),
    defRow('Renewal Term','Any period for which this Agreement is renewed in terms of clause 3.2.'),
    defRow('Retainer','The recurring monthly fee payable by the Client as set out in Schedule A.'),
    defRow('Schedule A','The product-specific schedule attached to this Agreement that sets out the Services, fees, term, deliverables, timelines, and product-specific obligations.'),
    defRow('Services','The marketing, design, deployment, and related services to be provided by Marketing iO to the Client as set out in Schedule A.'),
    defRow('Setup Fee','The once-off establishment fee payable by the Client at the commencement of the Agreement, as set out in Schedule A.'),
    defRow('Term','The Initial Term together with any Renewal Term.')
  ] }))
  ch.push(SPACER(120))
  ch.push(P('1.2 Headings are for convenience only and shall not be used in interpretation. Words importing one gender include all genders. The singular includes the plural and vice versa.'))
  ch.push(P('1.3 Where any number of days is prescribed, the same shall be reckoned exclusively of the first and inclusively of the last day, unless that last day is not a Business Day, in which case the last day shall be the next Business Day.'))
  ch.push(PAGEBREAK())

  ch.push(H2('2. ENGAGEMENT AND SERVICES'))
  ;['2.1 Marketing iO is hereby appointed by the Client to provide the Services described in Schedule A, and Marketing iO accepts such appointment, subject to the terms of this Agreement.',
    '2.2 The Services, Deliverables, Fees, Term, timelines, service levels, and any product-specific terms shall be as set out in Schedule A. In the event of any conflict between the body of this Agreement and Schedule A, the terms of Schedule A shall prevail in respect of product-specific matters.',
    '2.3 Marketing iO shall perform the Services with reasonable skill, care, and diligence, in accordance with generally accepted industry standards.',
    '2.4 Marketing iO does not warrant or guarantee any particular commercial outcome, including any specific number of leads, sales, search-engine ranking, social-media followers, or revenue increase. Marketing outcomes depend on a wide range of factors outside Marketing iO\'s control. The Client acknowledges this at signature.',
    '2.5 Waiting period / lead time. The Client acknowledges that production of the Setup Phase Deliverables and Go-Live takes time, as set out in the timeline of the applicable Schedule A. Lead-times begin to run from clearance of the Setup Fee in terms of clause 4.3.'].forEach(t => ch.push(P(t)))

  ch.push(H2('3. TERM AND RENEWAL'))
  ;['3.1 This Agreement commences on the Effective Date and continues for the Initial Term specified in Schedule A.',
    '3.2 Auto-renewal. Upon expiry of the Initial Term, this Agreement automatically renews for successive Renewal Terms equal in duration to the Initial Term, unless the Client gives Marketing iO at least thirty (30) calendar days\' written notice of non-renewal prior to the expiry of the then-current Term.',
    '3.3 Where the Client is a "consumer" as defined in the CPA, Marketing iO shall notify the Client in writing not more than eighty (80) and not less than forty (40) Business Days before expiry of the then-current Term of the impending expiry and of the Client\'s right to terminate or accept renewal in terms of section 14 of the CPA.',
    '3.4 Written notice of non-renewal may be given by email to info@marketingio.co.za, or to such updated email address as Marketing iO may notify in writing.'].forEach(t => ch.push(P(t)))

  ch.push(H2('4. FEES, PAYMENT, AND DEBIT-FAILURE ESCALATION'))
  ;['4.1 In consideration for the Services, the Client shall pay Marketing iO the Setup Fee and the Retainer specified in Schedule A.',
    '4.2 VAT. All amounts in Schedule A are exclusive of Value-Added Tax (VAT), which shall be added at the prevailing rate where applicable. As at the Effective Date, Marketing iO may not be registered for VAT, in which case no VAT will be charged. The Client will be notified in writing if Marketing iO becomes a VAT vendor.',
    '4.3 Setup Fee — payable before commencement. The Setup Fee shall be invoiced upon signature of this Agreement and paid in full by the Client prior to the commencement of the Services. Marketing iO shall have no obligation to commence the Services until the Setup Fee has been received and cleared.'].forEach(t => ch.push(P(t)))
  ch.push(CALLOUT('4.4  PRO-RATA FIRST INVOICE','Where the Services commence (Go-Live) on a date other than the 1st of a calendar month, the Client\'s first monthly Retainer invoice shall be raised on a pro-rata basis, calculated as: (full monthly Retainer) × (number of calendar days from Go-Live to end of that calendar month) ÷ (number of days in that calendar month). Thereafter the full monthly Retainer is payable in advance on the agreed debit-order date (1st or 15th).'))
  ch.push(P('4.5 Debit order. The Retainer shall be paid by way of monthly debit order, processed on the 1st or 15th day of each calendar month as agreed in writing between the Parties. The Client shall sign the Debit Order Mandate (Schedule B) authorising Marketing iO or its appointed collection agent to process the Retainer monthly.'))
  ch.push(CALLOUT('4.6  FAILED DEBITS — THREE-STRIKE ESCALATION (consumer-protective but firm)','• THREE (3) consecutive months of failed debits: The Client is in material breach and owes Marketing iO the cumulative arrears plus interest under clause 4.10.\n• MONTH FIVE (5) of failed debits: Marketing iO is entitled to SUSPEND the Services. Suspension does not extend the Term, reduce the Client\'s obligations, or release the Client from any amount owing.\n• MONTHS SEVEN (7) THROUGH TEN (10) of failed debits: Marketing iO is entitled to refer the Client\'s account to legal collection, list the Client with credit bureaux to the extent permitted by law, and pursue the full balance owing.\n• While the Client is in arrears, the Client remains obligated to pay Marketing iO for as long as the Client is within the Term of this Agreement.','FEEAEA'))
  ;['4.7 Acceleration on repeated default. Without limiting clause 4.6, if three (3) debit orders fail within any rolling twelve (12) month period, the full remaining Retainer for the balance of the then-current Term shall, at Marketing iO\'s election, become immediately due and payable as a liquidated debt.',
    '4.8 No chargebacks or reversals. The Client warrants that it shall not initiate any chargeback, debit-order reversal, or payment dispute with its bank or payment provider in respect of any amount lawfully due under this Agreement. Any chargeback or reversal initiated by the Client in breach of this clause constitutes a material breach.',
    '4.9 Suspension does not extend Term. During any period of suspension, the Term shall continue to run and Retainer obligations shall continue to accrue. Suspension does not extend the Term, reduce the Client\'s payment obligations, or in any way affect the Client\'s liability for amounts already due.',
    '4.10 Interest on overdue amounts. Interest shall accrue on overdue amounts at the prime lending rate published by the South African Reserve Bank, plus 2%, calculated daily and compounded monthly from the due date until the date of actual payment.',
    '4.11 Cost recovery on default. The Client shall be liable for all costs of enforcement on the attorney-and-own-client scale, including collection commission and tracing fees, in addition to the underlying amount owing.'].forEach(t => ch.push(P(t)))
  ch.push(CALLOUT('4.12  NO REFUNDS','All amounts paid under this Agreement are non-refundable, save where (a) the Client validly withdraws within the Cooling-Off Period under clause 8.1 and Schedule A permits a refund of the Setup Fee in such case, or (b) a refund is required by mandatory law that cannot lawfully be excluded. No partial or full refund shall be payable in respect of any month already invoiced or commenced.'))
  ch.push(PAGEBREAK())

  ch.push(H2('5. CLIENT OBLIGATIONS'))
  ch.push(P('5.1 The Client undertakes to:'))
  ;['5.1.1 provide all brand assets, business information, logins, photographs, content, and other materials reasonably required by Marketing iO within the timelines set out in Schedule A;',
    '5.1.2 approve, comment on, or request revisions to drafts submitted by Marketing iO within the review windows specified in Schedule A. Failure to respond within such review window shall constitute deemed approval;',
    '5.1.3 honour the agreed debit-order date and maintain sufficient funds in the nominated bank account;',
    '5.1.4 warrant that all content, logos, photographs, and other materials provided are owned or properly licensed by the Client;',
    '5.1.5 comply with all product-specific obligations set out in Schedule A.'].forEach(t => ch.push(P(t)))

  ch.push(H2('6. SERVICE LEVELS'))
  ;['6.1 Marketing iO shall use commercially reasonable efforts to deliver the Services in accordance with the timelines and service-level commitments set out in Schedule A.',
    '6.2 Where Marketing iO foresees a delay, it shall notify the Client in writing as soon as reasonably practicable, specifying the cause and the expected revised delivery date.',
    '6.3 Time periods for delivery shall be extended automatically to the extent that delay is caused by: (i) failure or delay by the Client in meeting its obligations under clause 5; (ii) load-shedding or power failures beyond Marketing iO\'s reasonable control; (iii) any event of Force Majeure as contemplated in clause 13.',
    '6.4 Acknowledgement of work delivered. Upon delivery of any milestone Deliverable, the Client shall confirm receipt and acceptance in writing within five (5) Business Days. Failure to do so shall constitute deemed acceptance.'].forEach(t => ch.push(P(t)))

  ch.push(H2('7. INTELLECTUAL PROPERTY'))
  ;['7.1 Subject to receipt by Marketing iO of all amounts due and payable under this Agreement, the Client shall own all right, title, and interest in and to the final approved Deliverables produced specifically for the Client.',
    '7.2 Notwithstanding clause 7.1, Marketing iO shall retain all right, title, and interest in and to: (i) its proprietary methodology, templates, frameworks, and know-how; (ii) any tools, software, or platforms developed or licensed by Marketing iO; (iii) generic stock images, fonts, audio, and other licensed third-party assets.',
    '7.3 Domain transfer. Where Marketing iO has registered a domain on behalf of the Client, transfer shall only occur after the Client has settled all amounts due and payable.',
    '7.4 Portfolio rights. Marketing iO may showcase the Deliverables and the Client\'s logo in its marketing portfolio unless the Client expressly opts out by written notice.'].forEach(t => ch.push(P(t)))
  ch.push(PAGEBREAK())

  ch.push(H2('8. CANCELLATION, COOLING-OFF, AND EXIT FEES'))
  ch.push(CALLOUT('8.1  COOLING-OFF — FIVE (5) BUSINESS DAYS','Where the Client is a "consumer" under the CPA and concluded this Agreement other than in person, the Client may, within five (5) Business Days of the Effective Date, cancel by written notice to info@marketingio.co.za without reason and without penalty. Within the Cooling-Off Period: (a) the Setup Fee shall be refunded LESS a reasonable charge for any Services already rendered plus an administrative charge equal to fifteen percent (15%) of the Setup Fee; (b) any Deliverables already produced shall be returned to Marketing iO or destroyed. After the five (5) Business Day Cooling-Off Period, clause 4.12 (No Refunds) applies in full.'))
  ch.push(P('8.2 Save for the Cooling-Off right in clause 8.1, the Client may not cancel this Agreement during the Term other than as expressly provided in this clause 8 or in clause 9. Auto-renewal is governed by clause 3.2 and may be prevented by the Client giving thirty (30) calendar days\' written notice of non-renewal prior to expiry of the then-current Term.'))
  ch.push(H3('Cancellation Scale — Recurring Packages (Ignite, Accelerate, Dominate)'))
  ch.push(new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [4680, 4680],
    rows: [
      new TableRow({ children: [
        new TableCell({ borders: cellBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, width: { size: 4680, type: WidthType.DXA }, margins: cellPad, children: [new Paragraph({ children: [new TextRun({ text: 'Cancellation Point', bold: true, color: 'FFFFFF', size: 20, font: 'Calibri' })] })] }),
        new TableCell({ borders: cellBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, width: { size: 4680, type: WidthType.DXA }, margins: cellPad, children: [new Paragraph({ children: [new TextRun({ text: 'Amount Payable by Client', bold: true, color: 'FFFFFF', size: 20, font: 'Calibri' })] })] })
      ]}),
      ...[['Within Cooling-Off Period (clause 8.1)','See clause 8.1 above'],['Before Go-Live (after Cooling-Off)','Setup Fee retained in full + one (1) month\'s Retainer'],['Months 1 – 6 of Initial Term','Twenty-five percent (25%) of Retainer payable for the remaining months of the Initial Term'],['Months 7 – 12 of Initial Term','Thirty (30) calendar days\' written notice + one (1) month\'s Retainer in lieu of notice'],['During any Renewal Term','Thirty (30) calendar days\' written notice + one (1) month\'s Retainer in lieu of notice']]
      .map(([a,b]) => new TableRow({ children: [
        new TableCell({ borders: cellBorders, width: { size: 4680, type: WidthType.DXA }, margins: cellPad, children: [new Paragraph({ children: [new TextRun({ text: a, size: 20, font: 'Calibri' })] })] }),
        new TableCell({ borders: cellBorders, width: { size: 4680, type: WidthType.DXA }, margins: cellPad, children: [new Paragraph({ children: [new TextRun({ text: b, size: 20, font: 'Calibri' })] })] })
      ]}))
    ]}))
  ch.push(SPACER(160))
  ;['8.3 The Street Pulse package is supplied on a fixed three (3) month locked term. The Client may not cancel mid-term. To prevent auto-renewal, the Client must give thirty (30) calendar days\' written notice prior to expiry of the then-current term.',
    '8.4 Township Pulse is a once-off campaign payable in full at signature. Once design work has commenced, the Township Pulse fee is non-refundable.',
    '8.5 Add-ons may be cancelled on thirty (30) calendar days\' written notice. Where cancellation of an add-on occurs within the first six (6) months, the Client shall pay an early-exit fee of R1,500.00.',
    '8.6 Cancellation must be in writing to info@marketingio.co.za. Verbal or informal cancellation has no effect. Pending arrears are not extinguished by cancellation.'].forEach(t => ch.push(P(t)))
  ch.push(PAGEBREAK())

  ch.push(H2('9. TERMINATION FOR BREACH'))
  ;['9.1 Either Party may terminate this Agreement with immediate effect by written notice if the other Party: (i) commits a material breach and fails to remedy such breach within fourteen (14) Business Days of receiving written notice; (ii) becomes insolvent, is placed in liquidation or business rescue; or (iii) ceases or threatens to cease conducting business in the ordinary course.',
    '9.2 Termination shall not relieve either Party of any obligation accrued prior to termination, nor of any obligation that by its nature is intended to survive termination.'].forEach(t => ch.push(P(t)))

  ch.push(H2('10. CONFIDENTIALITY'))
  ;['10.1 Each Party agrees to keep confidential all non-public information disclosed to it by the other Party in connection with this Agreement. The Receiving Party shall: (i) use Confidential Information solely to perform its obligations; (ii) not disclose it to any third party without prior written consent; and (iii) protect it with at least reasonable care.',
    '10.2 This obligation shall not apply to information that is or becomes publicly known through no breach of this Agreement, was known prior to disclosure, is independently developed, or is required to be disclosed by law or court order.',
    '10.3 This clause 10 shall survive termination for three (3) years.'].forEach(t => ch.push(P(t)))

  ch.push(H2('11. PROTECTION OF PERSONAL INFORMATION (POPIA)'))
  ;['11.1 Where Marketing iO processes Personal Information of any Data Subject on behalf of the Client, Marketing iO acts as an Operator within the meaning of POPIA, and the Client acts as the Responsible Party.',
    '11.2 The Parties shall be bound by the POPIA Operator Agreement attached as Part 7.',
    '11.3 The Client warrants that it has a lawful basis under POPIA for any Personal Information provided to Marketing iO, and indemnifies Marketing iO against any claim, fine, or penalty arising from the Client\'s failure to comply with POPIA.'].forEach(t => ch.push(P(t)))

  ch.push(H2('12. LIMITATION OF LIABILITY'))
  ;['12.1 Marketing iO\'s total aggregate liability shall not exceed the total amount of fees actually paid by the Client to Marketing iO during the six (6) months immediately preceding the event giving rise to the claim.',
    '12.2 In no event shall Marketing iO be liable to the Client for any indirect, consequential, special, incidental, or punitive damages, including loss of profit, revenue, business opportunity, goodwill, or data.'].forEach(t => ch.push(P(t)))
  ch.push(PAGEBREAK())

  ch.push(H2('13. FORCE MAJEURE'))
  ;['13.1 Neither Party shall be liable for any failure or delay caused by an event beyond its reasonable control, including acts of God, war, civil unrest, epidemic or pandemic, government action, sustained load-shedding stages 4 and above, or prolonged disruption of telecommunications or internet infrastructure.',
    '13.2 If a Force Majeure Event continues for more than sixty (60) consecutive calendar days, either Party may terminate this Agreement by written notice.'].forEach(t => ch.push(P(t)))

  ch.push(H2('14. DISPUTE RESOLUTION'))
  ch.push(P('14.1 The Parties shall first endeavour to resolve any dispute amicably through good-faith negotiation. If unresolved within fourteen (14) Business Days, the Parties shall refer the dispute to mediation under AFSA, held in Polokwane. If mediation fails, either Party may refer the dispute to arbitration under the AFSA Commercial Arbitration Rules. The arbitrator\'s decision shall be final and binding.'))

  ch.push(H2('15. GENERAL'))
  ;['15.1 Governing Law. This Agreement shall be governed by the laws of the Republic of South Africa.',
    '15.2 Jurisdiction. Subject to clause 14, the Parties consent to the non-exclusive jurisdiction of the Magistrate\'s Court of Polokwane.',
    '15.3 Whole Agreement. This Agreement, together with Schedule A, Schedule B, and the POPIA Operator Agreement, constitutes the whole agreement.',
    '15.4 Variation. No variation shall be effective unless reduced to writing and signed by both Parties.',
    '15.5 Severability. If any provision is found invalid, the remainder continues in force.',
    '15.6 Cession. The Client shall not cede any rights without Marketing iO\'s prior written consent.',
    '15.7 No Waiver. No failure or delay in exercising any right shall operate as a waiver.',
    '15.8 Notices. Any notice shall be in writing, by email or hand delivery to the addresses at the head of this Agreement.',
    '15.9 Counterparts and Electronic Signature. Electronic signatures complying with the Electronic Communications and Transactions Act 25 of 2002 are valid and binding.',
    '15.10 Independent Contractors. The Parties are independent contractors. Nothing herein creates a partnership, joint venture, agency, or employer-employee relationship.'].forEach(t => ch.push(P(t)))

  ch.push(H2('16. STAFF PROTECTIONS, ANTI-CIRCUMVENTION, AND CONDUCT'))
  ;['16.1 No personal liability of staff. This Agreement is between the Client and Marketing iO (Pty) Ltd as a juristic person. No employee, director, or representative of Marketing iO shall be personally liable.',
    '16.2 No off-contract promises. No representation, warranty, or promise made verbally or in writing outside this Agreement shall form part of this Agreement or create any liability, unless expressly recorded in writing and signed as a variation under clause 15.4.',
    '16.3 Formal communication channel. All formal Client communications shall be directed to info@marketingio.co.za. Communications with individual staff via personal channels shall not constitute formal notice.',
    '16.4 Anti-poaching. During the Term and for twelve (12) months after termination, the Client shall not solicit, employ, or engage any Marketing iO staff or contractor involved in the Services, save with prior written consent. Breach gives rise to liquidated damages equal to twelve (12) months of that person\'s gross monthly compensation.',
    '16.5 No direct engagement with sub-operators. The Client shall not contract directly with any sub-operator, freelancer, or third-party service provider that Marketing iO has introduced, save with prior written consent.',
    '16.6 No public disparagement. During the Term and twelve (12) months thereafter, the Client shall not make any public statement that is materially false, misleading, or knowingly disparaging of Marketing iO.',
    '16.7 Threat / harassment / abuse. Should the Client threaten, harass, or behave abusively toward any Marketing iO staff, Marketing iO may terminate with immediate effect; all amounts due for the remainder of the Term shall become immediately payable as a liquidated debt.',
    '16.8 Survival. Clauses 16.1, 16.2, 16.4, 16.5, 16.6, and 16.7 shall survive termination.'].forEach(t => ch.push(P(t)))

  ch.push(SPACER(200))
  ch.push(H1('SIGNED BY THE PARTIES — PART 1 (MASTER SERVICE AGREEMENT)'))
  ch.push(...sigBlock('FOR AND ON BEHALF OF: MARKETING iO (PTY) LTD', 'Marketing iO (Pty) Ltd'))
  ch.push(SPACER(200))
  ch.push(...sigBlock('FOR AND ON BEHALF OF: THE CLIENT', 'The Client'))
  ch.push(PAGEBREAK())

  // SCHEDULE A
  ch.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: `PART ${s.part}`, bold: true, color: GREY, size: 18, font: 'Calibri' })] }))
  ch.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: `SCHEDULE A — ${s.name}`, bold: true, color: NAVY, size: 30, font: 'Calibri' })] }))
  ch.push(P('This Schedule A is attached to and forms part of the Master Service Agreement. In the event of any conflict, this Schedule A shall prevail in respect of product-specific matters.', { after: 200 }))
  ch.push(new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [2800, 6560],
    rows: [['Package', s.name.replace(' PACKAGE','')],['Setup Fee',`${s.setup} (excl. VAT where applicable)`],['Monthly Retainer', s.monthly],['Initial Term', s.term]]
    .map(([k,v]) => new TableRow({ children: [
      new TableCell({ borders: cellBorders, shading: { fill: LIGHT, type: ShadingType.CLEAR }, width: { size: 2800, type: WidthType.DXA }, margins: cellPad, children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, size: 20, font: 'Calibri' })] })] }),
      new TableCell({ borders: cellBorders, width: { size: 6560, type: WidthType.DXA }, margins: cellPad, children: [new Paragraph({ children: [new TextRun({ text: v, size: 20, font: 'Calibri' })] })] })
    ]}))
  }))
  ch.push(SPACER(180))
  ch.push(H3('A. SERVICES AND DELIVERABLES'))
  ch.push(SUB('Setup Phase Deliverables'))
  s.setupItems.forEach((i: string) => ch.push(P(`•  ${i}`)))
  ch.push(SUB('Recurring Monthly Deliverables'))
  s.recurring.forEach((i: string) => ch.push(P(`•  ${i}`)))
  ch.push(H3('B. TIMELINE AND SERVICE LEVEL'))
  ch.push(P(s.timeline))
  ch.push(P(s.sla, { bold: true }))
  ch.push(H3('C. CLIENT OBLIGATIONS (additional to clause 5 of the Agreement)'))
  s.clientObs.forEach((i: string) => ch.push(P(`•  ${i}`)))
  ch.push(H3('D. SCOPE EXCLUSIONS'))
  ch.push(P('The following are not included and require a separate add-on or upgrade:'))
  s.exclusions.forEach((i: string) => ch.push(P(`•  ${i}`)))
  ch.push(H3('E. SIGN-OFF AND ACCEPTANCE'))
  ch.push(P(s.signoff))
  ch.push(PAGEBREAK())

  // PART 7 — POPIA OPERATOR AGREEMENT
  ch.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'PART 7', bold: true, color: GREY, size: 18, font: 'Calibri' })] }))
  ch.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: 'POPIA OPERATOR AGREEMENT', bold: true, color: NAVY, size: 30, font: 'Calibri' })] }))
  ch.push(P('This POPIA Operator Agreement is entered into between Marketing iO (Pty) Ltd (the "Operator") and the Client (the "Responsible Party"), and is annexed to and forms part of the Master Service Agreement. This Operator Agreement is concluded in compliance with section 21 of POPIA.', { after: 180 }))
  ch.push(H3('OA1. Definitions'))
  ch.push(P('"Data Subject", "Personal Information", "Processing", and "Security Compromise" bear the meanings ascribed to them in POPIA.'))
  ch.push(H3('OA2. Scope of Processing'))
  ;['OA2.1 The Operator processes Personal Information on behalf of the Responsible Party solely to provide the Services as described in Schedule A.',
    'OA2.2 Categories of Personal Information may include: names, contact details, website-analytics data, social-media engagement data, customer enquiries, marketing-list contact details, and other Personal Information shared for the Services.'].forEach(t => ch.push(P(t)))
  ch.push(H3('OA3. Operator Obligations'))
  ch.push(P('The Operator shall: (i) process Personal Information only with the Responsible Party\'s knowledge or authorisation; (ii) treat Personal Information as confidential; (iii) notify the Responsible Party where any instruction would contravene POPIA; (iv) not transfer Personal Information across the borders of the Republic save with prior written consent and compliant with section 72 of POPIA.'))
  ch.push(H3('OA4. Security Safeguards'))
  ;['OA4.1 The Operator shall secure Personal Information by reasonable, appropriate, technical and organisational measures to prevent loss, damage, unauthorised destruction, or unlawful access.',
    'OA4.2 The Operator shall implement at a minimum: password-protected access; multi-factor authentication for administrative accounts; encryption in transit (HTTPS/TLS); regular secure backups; staff confidentiality undertakings; documented access-revocation procedures.'].forEach(t => ch.push(P(t)))
  ch.push(H3('OA5. Sub-operators'))
  ch.push(P('OA5.1 The Operator may engage sub-operators (hosting, email service providers, social-media platforms). The Responsible Party hereby provides general authorisation for such engagements. The Operator shall ensure each sub-operator is contractually bound by equivalent data-protection obligations. The Operator remains liable for sub-operators\' acts and omissions in respect of Processing.'))
  ch.push(H3('OA6. Data Subject Rights'))
  ch.push(P('OA6.1 The Operator shall assist the Responsible Party in fulfilling its obligations to respond to Data Subject requests, including access, correction, deletion, and objection. Where the Operator receives a request directly from a Data Subject, it shall promptly forward it to the Responsible Party.'))
  ch.push(H3('OA7. Notification of Security Compromise'))
  ch.push(P('OA7.1 The Operator shall notify the Responsible Party in writing without undue delay, and in any event within seventy-two (72) hours of becoming aware of any Security Compromise, describing: nature of the compromise; categories and approximate number of Data Subjects and records affected; likely consequences; and measures taken or proposed.'))
  ch.push(H3('OA8. Return or Deletion'))
  ch.push(P('OA8.1 Upon termination, the Operator shall within thirty (30) calendar days, at the written election of the Responsible Party, either return all Personal Information in a commonly-used electronic format, or securely delete it, save where retention is required by law.'))
  ch.push(H3('OA9. Liability'))
  ch.push(P('OA9.1 The limitations of liability in clause 12 of the Master Service Agreement apply to this Operator Agreement. The Responsible Party warrants its lawful basis under POPIA and indemnifies the Operator against any claim, fine, or penalty arising from the Responsible Party\'s non-compliance.'))
  ch.push(H3('OA10. Term and General'))
  ch.push(P('OA10.1 This Operator Agreement continues so long as the Operator processes Personal Information on behalf of the Responsible Party. Clauses OA3, OA4, OA7, OA8, and OA9 shall survive termination. Governed by the laws of the Republic of South Africa.'))

  ch.push(SPACER(200))
  ch.push(H1('SIGNED BY THE PARTIES — PART 7 (POPIA OPERATOR AGREEMENT)'))
  ch.push(...sigBlock('FOR AND ON BEHALF OF: MARKETING iO (PTY) LTD — Operator', 'Marketing iO (Pty) Ltd'))
  ch.push(SPACER(200))
  ch.push(...sigBlock('FOR AND ON BEHALF OF: THE CLIENT — Responsible Party', 'The Client'))
  ch.push(PAGEBREAK())

  // PART 8 — DEBIT ORDER MANDATE
  ch.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'PART 8', bold: true, color: GREY, size: 18, font: 'Calibri' })] }))
  ch.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: 'SCHEDULE B — DEBIT ORDER MANDATE', bold: true, color: NAVY, size: 30, font: 'Calibri' })] }))
  ch.push(P('I, the undersigned, hereby authorise Marketing iO (Pty) Ltd (or its appointed collection agent) to draw against the account specified below, the monthly Retainer set out in Schedule A, on the agreed date each month, until cancelled by me in writing.', { after: 160 }))
  ch.push(new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [2800, 6560], rows: [
    [`Account Holder`, `${client.contact_person} / ${client.business_name}`],
    ['Bank','__________________________________________________________________'],['Account Number','__________________________________________________________________'],['Branch Code','__________________________________________________________________'],['Account Type','☐ Cheque   ☐ Savings   ☐ Transmission'],['Debit Date','☐ 1st of each month     ☐ 15th of each month'],[`Monthly Amount`,`${fmtZar(monthly)} (per Schedule A — fixed for the Term)`],['First Debit Date','__________________________________________________________________'],['Account Holder ID No.','__________________________________________________________________'],['Signature','__________________________________________________________________'],['Date','__________________________________________________________________']
  ].map(([k,v]) => new TableRow({ children: [
    new TableCell({ borders: cellBorders, shading: { fill: LIGHT, type: ShadingType.CLEAR }, width: { size: 2800, type: WidthType.DXA }, margins: cellPad, children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, size: 20, font: 'Calibri' })] })] }),
    new TableCell({ borders: cellBorders, width: { size: 6560, type: WidthType.DXA }, margins: cellPad, children: [new Paragraph({ children: [new TextRun({ text: v, size: 20, font: 'Calibri' })] })] })
  ]}))}))
  ch.push(SPACER(160))
  ch.push(P('I confirm that the account is in my name (or I am authorised to mandate debits against it). Cancellation of this mandate must be in writing and is subject to my contractual obligations under the Master Service Agreement, including without limitation clauses 4.6, 4.7, 4.12, and 8.', { italics: true }))
  ch.push(PAGEBREAK())

  // PART 9 — GO-LIVE ACKNOWLEDGEMENTS
  ch.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'PART 9', bold: true, color: GREY, size: 18, font: 'Calibri' })] }))
  ch.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: 'GO-LIVE & ONBOARDING ACKNOWLEDGEMENTS', bold: true, color: NAVY, size: 30, font: 'Calibri' })] }))
  ch.push(P('The Client confirms understanding of and consent to the following key terms by initialling each line.', { italics: true, after: 200 }))
  const ack = (lbl: string) => new Paragraph({ spacing: { after: 160 }, tabStops: [{ type: TabStopType.RIGHT, position: 9000 }],
    children: [new TextRun({ text: '☐  ', size: 22, font: 'Calibri' }), new TextRun({ text: lbl, size: 20, font: 'Calibri' }), new TextRun({ text: '\tClient initials: __________', size: 18, color: GREY, font: 'Calibri' })] })
  ;['I have read and understood the package, fees, term, and debit-order date as set out in Schedule A.',
    'I understand there is a waiting period / lead-time for delivery that only begins to run once my Setup Fee has cleared.',
    'I understand Marketing iO does not guarantee any specific commercial outcome (clause 2.4).',
    'I understand the cancellation scale and exit fees that apply if I cancel during the Term (clause 8).',
    'I understand that this Agreement auto-renews unless I give thirty (30) days\' written notice of non-renewal (clause 3.2).',
    'I understand the THREE-STRIKE debit-failure escalation: 3 failed months = breach; month 5 = suspension; months 7–10 = legal collections (clause 4.6).',
    'I understand the acceleration clause: 3 failed debits in any rolling 12 months may make the full remaining Retainer immediately due (clause 4.7).',
    'I undertake not to initiate any chargeback or debit reversal for amounts lawfully due (clause 4.8).',
    'I understand NO REFUNDS apply, save within the five (5) Business Day Cooling-Off Period (clause 4.12 / 8.1).',
    'I understand my first month\'s invoice may be PRO-RATA if Go-Live falls mid-month (clause 4.4).',
    'I have signed (or will sign) the Debit Order Mandate (Schedule B / Part 8).',
    'I have read and agree to the POPIA Operator Agreement (Part 7) and confirm my lawful basis for any Personal Information I provide to Marketing iO.',
    'I confirm my contact details are correct: phone, WhatsApp number, and email, and consent to receiving service communications on these.',
    'I confirm I am authorised to bind my business / am of legal age and capacity to bind myself.'
  ].forEach(t => ch.push(ack(t)))
  ch.push(SPACER(200))
  ch.push(P('Acknowledged and accepted:', { bold: true }))
  ch.push(P('Client signature: ____________________________________________   Date: ________________'))
  ch.push(P('Name in print: ____________________________________________  Capacity: ____________________'))

  return new Document({
    creator: 'Marketing iO', title: 'Marketing iO Master Service Agreement V3.0',
    description: 'MSA V3.0 · Schedule A · POPIA Operator Agreement · Debit Mandate · Acknowledgements',
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1280, right: 1280, bottom: 1440, left: 1280 } } },
      footers: { default: new Footer({ children: [initialsFooter()] }) }, children: ch }]
  })
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  try {
    const { deal_id, contract_id } = await req.json()
    if (!deal_id || !contract_id) {
      return Response.json({ ok: false, error: 'missing_param', field: !deal_id ? 'deal_id' : 'contract_id' }, { status: 400 })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: deal, error: dealErr } = await supabase.from('deals')
      .select('id, package, setup_fee, monthly_retainer, debit_day, client_id')
      .eq('id', deal_id).single()
    if (dealErr || !deal) return Response.json({ ok: false, error: 'deal_not_found' }, { status: 404 })

    for (const f of ['package', 'setup_fee', 'monthly_retainer'] as const) {
      if (deal[f] === null || deal[f] === undefined || deal[f] === '') {
        return Response.json({ ok: false, error: 'missing_field', field: f }, { status: 422 })
      }
    }

    const { data: client, error: clientErr } = await supabase.from('clients')
      .select('id, business_name, contact_person, email, phone, whatsapp_number, address, id_reg_number')
      .eq('id', deal.client_id).single()
    if (clientErr || !client) return Response.json({ ok: false, error: 'client_not_found' }, { status: 404 })

    for (const f of ['business_name', 'contact_person', 'email', 'phone', 'whatsapp_number'] as const) {
      if (!client[f]) return Response.json({ ok: false, error: 'missing_field', field: f }, { status: 422 })
    }

    // Try to fetch logo from branding bucket; fall back gracefully
    let logoBytes: Uint8Array | null = null
    try {
      const { data: logoData } = await supabase.storage.from('branding').download('logo_email.png')
      if (logoData) logoBytes = new Uint8Array(await logoData.arrayBuffer())
    } catch { /* no logo — continue without it */ }

    const today = new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
    const doc = await buildDocument(client, deal, today, logoBytes)
    const buffer = await Packer.toBuffer(doc)

    const path = `${contract_id}/draft.docx`
    const { error: uploadErr } = await supabase.storage.from('contracts').upload(path, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: true
    })
    if (uploadErr) return Response.json({ ok: false, error: 'upload_failed', detail: uploadErr.message }, { status: 500 })

    const { data: { publicUrl } } = supabase.storage.from('contracts').getPublicUrl(path)

    const cover_summary = {
      generated_at: new Date().toISOString(),
      package: deal.package,
      setup_fee: Number(deal.setup_fee),
      monthly_retainer: Number(deal.monthly_retainer),
      debit_day: deal.debit_day,
      client_name: client.business_name,
      contact_person: client.contact_person,
      email: client.email,
      phone: client.phone,
      whatsapp_number: client.whatsapp_number,
      document_version: 'msa_v3.0'
    }

    const { error: updateErr } = await supabase.from('contracts').update({
      document_url: publicUrl, cover_summary, status: 'generated'
    }).eq('id', contract_id)
    if (updateErr) return Response.json({ ok: false, error: 'update_failed', detail: updateErr.message }, { status: 500 })

    return Response.json({ ok: true, docx_url: publicUrl, cover_summary })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('generate-contract error:', msg)
    return Response.json({ ok: false, error: 'internal_error', detail: msg }, { status: 500 })
  }
})

// src/constants/industryConfig.js
// 60 industry configurations for the My Business toolkit
// Each config defines: labels, booking verb, custom fields, thank-you email template

export const INDUSTRY_CONFIG = {

  // ═══════════════════════════════════════
  // FOOD & BEVERAGE (1-8)
  // ═══════════════════════════════════════

  butchery: {
    label: 'Butchery', customerLabel: 'Customer', bookingLabel: 'Order', bookingVerb: 'Place order',
    fields: [
      { key: 'items_ordered', label: 'Items / cuts ordered', type: 'textarea', placeholder: '2kg wors, 1kg T-bone, 500g mince' },
      { key: 'total_amount', label: 'Order total (R)', type: 'number' },
      { key: 'collection_time', label: 'Collection time', type: 'datetime-local' },
      { key: 'delivery', label: 'Delivery?', type: 'select', options: ['Collection', 'Delivery'] },
      { key: 'delivery_address', label: 'Delivery address', type: 'text', showIf: 'delivery=Delivery' },
    ],
    thankYou: 'Thank you for your order, {name}! It will be ready for {delivery} at {businessName}. 🥩',
  },

  bakery: {
    label: 'Bakery / Confectionery', customerLabel: 'Customer', bookingLabel: 'Order', bookingVerb: 'Place order',
    fields: [
      { key: 'items', label: 'Items ordered', type: 'textarea', placeholder: 'e.g. 2x loaves, 1x birthday cake (chocolate, "Happy 30th Thandi")' },
      { key: 'cake_size', label: 'Cake size (if applicable)', type: 'select', options: ['Small (6")', 'Medium (8")', 'Large (10")', 'XL (12")', 'Tiered', 'Cupcakes', 'N/A'] },
      { key: 'flavour', label: 'Flavour / design notes', type: 'textarea' },
      { key: 'collection_date', label: 'Collection date & time', type: 'datetime-local' },
      { key: 'total_amount', label: 'Total (R)', type: 'number' },
      { key: 'deposit_paid', label: 'Deposit', type: 'select', options: ['Not yet', 'Partial', 'Paid in full'] },
      { key: 'reference_photo', label: 'Design reference photo', type: 'file' },
    ],
    thankYou: 'Thank you for ordering from {businessName}, {name}! Your order will be ready on {collectionDate}. 🎂',
  },

  restaurant: {
    label: 'Restaurant / Takeaway', customerLabel: 'Customer', bookingLabel: 'Reservation', bookingVerb: 'Book table',
    fields: [
      { key: 'party_size', label: 'Number of guests', type: 'number' },
      { key: 'seating', label: 'Seating preference', type: 'select', options: ['Indoor', 'Outdoor', 'Private room', 'No preference'] },
      { key: 'special_requests', label: 'Special requests', type: 'textarea', placeholder: 'Birthday, dietary requirements, high chair...' },
      { key: 'pre_order', label: 'Pre-order items', type: 'textarea' },
    ],
    thankYou: 'Your table at {businessName} is booked for {bookingDate}, {name}! We look forward to serving you. 🍽️',
  },

  catering: {
    label: 'Catering', customerLabel: 'Client', bookingLabel: 'Event', bookingVerb: 'Book catering',
    fields: [
      { key: 'event_type', label: 'Event type', type: 'select', options: ['Wedding', 'Corporate', 'Birthday', 'Funeral', 'Graduation', 'Church event', 'Other'] },
      { key: 'guest_count', label: 'Number of guests', type: 'number' },
      { key: 'menu_type', label: 'Menu', type: 'select', options: ['Buffet', 'Plated', 'Braai', 'Finger food', 'Custom'] },
      { key: 'menu_details', label: 'Menu details', type: 'textarea' },
      { key: 'venue', label: 'Venue / delivery address', type: 'text' },
      { key: 'setup_time', label: 'Setup time', type: 'datetime-local' },
      { key: 'total_amount', label: 'Quote (R)', type: 'number' },
      { key: 'deposit_paid', label: 'Deposit', type: 'select', options: ['Not yet', 'Partial', 'Paid in full'] },
    ],
    thankYou: 'Thank you for booking {businessName} for your {eventType}, {name}! We\'ll make it unforgettable. 🍛',
  },

  spaza: {
    label: 'Spaza Shop / Tuck Shop', customerLabel: 'Customer', bookingLabel: 'Bulk Order', bookingVerb: 'Place bulk order',
    fields: [
      { key: 'items', label: 'Items ordered', type: 'textarea' },
      { key: 'total_amount', label: 'Total (R)', type: 'number' },
      { key: 'delivery_date', label: 'Delivery date', type: 'date' },
      { key: 'payment_method', label: 'Payment', type: 'select', options: ['Cash', 'EFT', 'Account'] },
    ],
    thankYou: 'Thank you for your order, {name}! {businessName} appreciates your support. 🛒',
  },

  liquor_store: {
    label: 'Liquor Store / Tavern', customerLabel: 'Customer', bookingLabel: 'Order', bookingVerb: 'Place order',
    fields: [
      { key: 'items', label: 'Items', type: 'textarea', placeholder: '1x case Black Label, 2x Hennessy...' },
      { key: 'total_amount', label: 'Total (R)', type: 'number' },
      { key: 'delivery', label: 'Collection or delivery', type: 'select', options: ['Collection', 'Delivery'] },
      { key: 'event_name', label: 'Event (if applicable)', type: 'text' },
    ],
    thankYou: 'Order confirmed, {name}! {businessName} has your order ready. Enjoy responsibly! 🍻',
  },

  food_truck: {
    label: 'Food Truck / Street Food', customerLabel: 'Customer', bookingLabel: 'Booking', bookingVerb: 'Book for event',
    fields: [
      { key: 'event_type', label: 'Event type', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'guest_count', label: 'Expected guests', type: 'number' },
      { key: 'menu', label: 'Menu selection', type: 'textarea' },
      { key: 'total_amount', label: 'Quote (R)', type: 'number' },
    ],
    thankYou: 'We\'re booked for your event, {name}! {businessName} is bringing the flavour. 🚚🔥',
  },

  fruit_veg: {
    label: 'Fruit & Veg / Fresh Produce', customerLabel: 'Customer', bookingLabel: 'Order', bookingVerb: 'Place order',
    fields: [
      { key: 'items', label: 'Items ordered', type: 'textarea', placeholder: '5kg tomatoes, 3kg onions, 2 watermelons...' },
      { key: 'total_amount', label: 'Total (R)', type: 'number' },
      { key: 'delivery_date', label: 'Delivery / collection', type: 'date' },
    ],
    thankYou: 'Fresh order confirmed, {name}! {businessName} — always fresh, always local. 🥬',
  },

  // ═══════════════════════════════════════
  // BEAUTY & PERSONAL CARE (9-14)
  // ═══════════════════════════════════════

  salon: {
    label: 'Hair Salon', customerLabel: 'Client', bookingLabel: 'Appointment', bookingVerb: 'Book appointment',
    fields: [
      { key: 'service_type', label: 'Service', type: 'select', options: ['Braids', 'Cornrows', 'Weave', 'Relaxer', 'Colour', 'Cut & Style', 'Wash & Blow', 'Dreadlocks', 'Wig install', 'Other'] },
      { key: 'stylist', label: 'Stylist', type: 'text' },
      { key: 'duration_minutes', label: 'Duration (min)', type: 'number', placeholder: '60' },
      { key: 'price', label: 'Price (R)', type: 'number' },
      { key: 'reference_photo', label: 'Reference photo', type: 'file' },
    ],
    thankYou: 'Your {serviceType} appointment at {businessName} is confirmed for {bookingDate}, {name}! See you soon 💇‍♀️',
  },

  barber: {
    label: 'Barbershop', customerLabel: 'Client', bookingLabel: 'Appointment', bookingVerb: 'Book appointment',
    fields: [
      { key: 'service_type', label: 'Service', type: 'select', options: ['Haircut', 'Beard trim', 'Haircut + beard', 'Shape-up', 'Hot towel shave', 'Kids cut', 'Design/pattern', 'Other'] },
      { key: 'barber', label: 'Barber', type: 'text' },
      { key: 'price', label: 'Price (R)', type: 'number' },
      { key: 'reference_photo', label: 'Style reference', type: 'file' },
    ],
    thankYou: 'You\'re booked at {businessName}, {name}! {serviceType} on {bookingDate}. Looking sharp! 💈',
  },

  nail_tech: {
    label: 'Nail Technician', customerLabel: 'Client', bookingLabel: 'Appointment', bookingVerb: 'Book appointment',
    fields: [
      { key: 'service_type', label: 'Service', type: 'select', options: ['Acrylic full set', 'Acrylic fill', 'Gel overlay', 'Gel polish', 'Pedicure', 'Mani + Pedi', 'Nail art', 'Removal', 'Other'] },
      { key: 'nail_shape', label: 'Shape', type: 'select', options: ['Square', 'Coffin', 'Stiletto', 'Almond', 'Round', 'Oval', 'Custom'] },
      { key: 'nail_length', label: 'Length', type: 'select', options: ['Short', 'Medium', 'Long', 'XL'] },
      { key: 'price', label: 'Price (R)', type: 'number' },
      { key: 'reference_photo', label: 'Design inspo', type: 'file' },
    ],
    thankYou: 'Appointment booked, {name}! Your {serviceType} at {businessName} is on {bookingDate}. Can\'t wait! 💅',
  },

  lash_tech: {
    label: 'Lash Technician', customerLabel: 'Client', bookingLabel: 'Appointment', bookingVerb: 'Book appointment',
    fields: [
      { key: 'service_type', label: 'Service', type: 'select', options: ['Classic full set', 'Classic fill', 'Volume full set', 'Volume fill', 'Hybrid', 'Lash lift & tint', 'Removal', 'Other'] },
      { key: 'lash_style', label: 'Style', type: 'select', options: ['Natural', 'Cat eye', 'Doll eye', 'Wispy', 'Mega volume', 'Custom'] },
      { key: 'price', label: 'Price (R)', type: 'number' },
      { key: 'reference_photo', label: 'Lash inspo', type: 'file' },
    ],
    thankYou: 'Lash appointment confirmed, {name}! {serviceType} at {businessName} on {bookingDate}. Flutter ready! 👁️✨',
  },

  spa: {
    label: 'Spa / Wellness Centre', customerLabel: 'Client', bookingLabel: 'Appointment', bookingVerb: 'Book treatment',
    fields: [
      { key: 'treatment', label: 'Treatment', type: 'select', options: ['Full body massage', 'Back massage', 'Hot stone', 'Facial', 'Body scrub', 'Couples massage', 'Prenatal massage', 'Package deal', 'Other'] },
      { key: 'therapist', label: 'Therapist', type: 'text' },
      { key: 'duration_minutes', label: 'Duration (min)', type: 'number' },
      { key: 'price', label: 'Price (R)', type: 'number' },
      { key: 'health_conditions', label: 'Health conditions to note', type: 'textarea' },
    ],
    thankYou: 'Your {treatment} at {businessName} is confirmed for {bookingDate}, {name}. Relax, we\'ve got you. 🧖‍♀️',
  },

  makeup_artist: {
    label: 'Makeup Artist (MUA)', customerLabel: 'Client', bookingLabel: 'Booking', bookingVerb: 'Book MUA',
    fields: [
      { key: 'occasion', label: 'Occasion', type: 'select', options: ['Wedding', 'Matric dance', 'Photoshoot', 'Birthday', 'Corporate', 'Everyday glam', 'Editorial', 'Other'] },
      { key: 'look', label: 'Look / style', type: 'text', placeholder: 'e.g. Soft glam, bold, natural' },
      { key: 'travel', label: 'Location', type: 'select', options: ['At studio', 'Mobile — I come to you'] },
      { key: 'travel_address', label: 'Address (if mobile)', type: 'text', showIf: 'travel=Mobile — I come to you' },
      { key: 'price', label: 'Price (R)', type: 'number' },
      { key: 'reference_photo', label: 'Inspo photo', type: 'file' },
    ],
    thankYou: 'Booking confirmed, {name}! {businessName} will have you looking stunning for your {occasion}. 💄',
  },

  // ═══════════════════════════════════════
  // FASHION & RETAIL (15-20)
  // ═══════════════════════════════════════

  dressmaker: {
    label: 'Dressmaker / Tailor', customerLabel: 'Client', bookingLabel: 'Order', bookingVerb: 'New order',
    fields: [
      { key: 'garment_type', label: 'Garment', type: 'select', options: ['Dress', 'Suit', 'Skirt', 'Trousers', 'Shirt', 'Traditional wear', 'Wedding dress', 'Alterations', 'School uniform', 'Other'] },
      { key: 'measurements', label: 'Measurements', type: 'textarea', placeholder: 'Bust: __cm, Waist: __cm, Hips: __cm, Length: __cm' },
      { key: 'fabric', label: 'Fabric', type: 'text' },
      { key: 'design_notes', label: 'Design notes', type: 'textarea' },
      { key: 'fitting_date', label: 'Fitting date', type: 'date' },
      { key: 'price', label: 'Price (R)', type: 'number' },
      { key: 'deposit_paid', label: 'Deposit', type: 'select', options: ['No', 'Partial', 'Full'] },
      { key: 'reference_photo', label: 'Design reference', type: 'file' },
    ],
    thankYou: 'Your {garmentType} order at {businessName} is confirmed, {name}! Fitting scheduled for {fittingDate}. 🧵',
  },

  shoemaker: {
    label: 'Shoe Maker / Cobbler', customerLabel: 'Customer', bookingLabel: 'Repair / Order', bookingVerb: 'New repair',
    fields: [
      { key: 'item_type', label: 'Item', type: 'select', options: ['Shoes', 'Boots', 'Sandals', 'Heels', 'Handbag', 'Belt', 'Custom order', 'Other'] },
      { key: 'service', label: 'Service', type: 'select', options: ['Sole replacement', 'Heel repair', 'Stitch repair', 'Polish & clean', 'Custom make', 'Resize', 'Other'] },
      { key: 'shoe_size', label: 'Size', type: 'text' },
      { key: 'price', label: 'Price (R)', type: 'number' },
      { key: 'pickup_date', label: 'Ready for pickup', type: 'date' },
      { key: 'photo', label: 'Photo', type: 'file' },
    ],
    thankYou: 'Your {service} at {businessName} is in progress, {name}! Ready by {pickupDate}. 👞',
  },

  clothing_store: {
    label: 'Clothing Store / Boutique', customerLabel: 'Customer', bookingLabel: 'Order', bookingVerb: 'Place order',
    fields: [
      { key: 'items', label: 'Items', type: 'textarea' },
      { key: 'sizes', label: 'Sizes', type: 'text' },
      { key: 'total_amount', label: 'Total (R)', type: 'number' },
      { key: 'delivery', label: 'Collection or delivery', type: 'select', options: ['Collection', 'Delivery', 'Try-on in store'] },
    ],
    thankYou: 'Thank you for shopping at {businessName}, {name}! Your style, our passion. 👗',
  },

  jeweller: {
    label: 'Jeweller / Accessories', customerLabel: 'Customer', bookingLabel: 'Order', bookingVerb: 'Place order',
    fields: [
      { key: 'item_type', label: 'Item', type: 'select', options: ['Ring', 'Necklace', 'Bracelet', 'Earrings', 'Watch', 'Custom piece', 'Repair', 'Engraving', 'Other'] },
      { key: 'material', label: 'Material', type: 'select', options: ['Gold', 'Silver', 'Rose gold', 'Platinum', 'Stainless steel', 'Beaded', 'Other'] },
      { key: 'ring_size', label: 'Ring size (if applicable)', type: 'text' },
      { key: 'engraving', label: 'Engraving text', type: 'text' },
      { key: 'price', label: 'Price (R)', type: 'number' },
      { key: 'ready_date', label: 'Ready date', type: 'date' },
      { key: 'reference_photo', label: 'Design reference', type: 'file' },
    ],
    thankYou: 'Your {itemType} order at {businessName} is confirmed, {name}! Ready by {readyDate}. 💍',
  },

  florist: {
    label: 'Florist', customerLabel: 'Customer', bookingLabel: 'Order', bookingVerb: 'Place order',
    fields: [
      { key: 'arrangement', label: 'Arrangement', type: 'select', options: ['Bouquet', 'Wreath', 'Centrepiece', 'Bridal', 'Funeral', 'Gift basket', 'Plants', 'Custom'] },
      { key: 'occasion', label: 'Occasion', type: 'text', placeholder: 'Birthday, anniversary, sympathy...' },
      { key: 'card_message', label: 'Card message', type: 'textarea' },
      { key: 'delivery', label: 'Delivery', type: 'select', options: ['Collection', 'Delivery'] },
      { key: 'delivery_address', label: 'Delivery address', type: 'text', showIf: 'delivery=Delivery' },
      { key: 'price', label: 'Price (R)', type: 'number' },
    ],
    thankYou: 'Your {arrangement} from {businessName} is being prepared, {name}! 🌸',
  },

  // ═══════════════════════════════════════
  // HEALTH & WELLNESS (21-26)
  // ═══════════════════════════════════════

  doctor: {
    label: 'Doctor / GP', customerLabel: 'Patient', bookingLabel: 'Consultation', bookingVerb: 'Schedule consultation',
    fields: [
      { key: 'visit_reason', label: 'Reason for visit', type: 'textarea' },
      { key: 'medical_aid', label: 'Medical aid', type: 'text', placeholder: 'Discovery, Bonitas, or Cash' },
      { key: 'medical_aid_number', label: 'Medical aid number', type: 'text' },
      { key: 'consultation_fee', label: 'Fee (R)', type: 'number' },
      { key: 'follow_up_date', label: 'Follow-up date', type: 'date' },
    ],
    thankYou: 'Thank you for visiting {businessName}, {name}. Wishing you good health! 🩺',
  },

  dentist: {
    label: 'Dentist', customerLabel: 'Patient', bookingLabel: 'Appointment', bookingVerb: 'Book appointment',
    fields: [
      { key: 'treatment', label: 'Treatment', type: 'select', options: ['Check-up & clean', 'Filling', 'Extraction', 'Root canal', 'Whitening', 'Braces consultation', 'Crown/bridge', 'Emergency', 'Other'] },
      { key: 'medical_aid', label: 'Medical aid', type: 'text' },
      { key: 'fee', label: 'Fee (R)', type: 'number' },
    ],
    thankYou: 'Your {treatment} appointment at {businessName} is confirmed for {bookingDate}, {name}. 🦷',
  },

  physiotherapist: {
    label: 'Physiotherapist / Chiropractor', customerLabel: 'Patient', bookingLabel: 'Session', bookingVerb: 'Book session',
    fields: [
      { key: 'condition', label: 'Condition / area', type: 'text', placeholder: 'Lower back pain, knee injury...' },
      { key: 'session_type', label: 'Session type', type: 'select', options: ['Initial assessment', 'Follow-up', 'Sports rehab', 'Post-surgery', 'Chronic pain', 'Other'] },
      { key: 'medical_aid', label: 'Medical aid', type: 'text' },
      { key: 'fee', label: 'Fee (R)', type: 'number' },
    ],
    thankYou: 'Your session at {businessName} is booked for {bookingDate}, {name}. Let\'s get you moving! 💪',
  },

  optometrist: {
    label: 'Optometrist', customerLabel: 'Patient', bookingLabel: 'Appointment', bookingVerb: 'Book eye test',
    fields: [
      { key: 'service', label: 'Service', type: 'select', options: ['Eye test', 'Contact lens fitting', 'Frame selection', 'Collection', 'Follow-up', 'Emergency'] },
      { key: 'medical_aid', label: 'Medical aid', type: 'text' },
      { key: 'fee', label: 'Fee (R)', type: 'number' },
    ],
    thankYou: 'Your eye appointment at {businessName} is confirmed for {bookingDate}, {name}. See you clearly! 👓',
  },

  pharmacy: {
    label: 'Pharmacy', customerLabel: 'Customer', bookingLabel: 'Script', bookingVerb: 'Submit script',
    fields: [
      { key: 'script_items', label: 'Prescription items', type: 'textarea' },
      { key: 'medical_aid', label: 'Medical aid', type: 'text' },
      { key: 'collection_time', label: 'Collection time', type: 'datetime-local' },
      { key: 'total_amount', label: 'Total (R)', type: 'number' },
    ],
    thankYou: 'Your prescription at {businessName} is ready for collection, {name}. Stay healthy! 💊',
  },

  traditional_healer: {
    label: 'Traditional Healer / Herbalist', customerLabel: 'Client', bookingLabel: 'Consultation', bookingVerb: 'Book consultation',
    fields: [
      { key: 'concern', label: 'Concern / reason', type: 'textarea' },
      { key: 'consultation_type', label: 'Type', type: 'select', options: ['Consultation', 'Cleansing', 'Divination', 'Herbal medicine', 'Follow-up'] },
      { key: 'fee', label: 'Fee (R)', type: 'number' },
    ],
    thankYou: 'Your consultation at {businessName} is confirmed, {name}. We look forward to helping you. 🌿',
  },

  // ═══════════════════════════════════════
  // PROFESSIONAL SERVICES (27-36)
  // ═══════════════════════════════════════

  lawyer: {
    label: 'Lawyer / Attorney', customerLabel: 'Client', bookingLabel: 'Consultation', bookingVerb: 'Book consultation',
    fields: [
      { key: 'matter_type', label: 'Matter type', type: 'select', options: ['Family law', 'Criminal', 'Labour', 'Property', 'Commercial', 'Debt collection', 'Immigration', 'Will & estates', 'Other'] },
      { key: 'brief', label: 'Brief description', type: 'textarea' },
      { key: 'fee', label: 'Consultation fee (R)', type: 'number' },
      { key: 'documents', label: 'Documents', type: 'file' },
    ],
    thankYou: 'Your consultation at {businessName} is confirmed for {bookingDate}, {name}. Please bring relevant documents. ⚖️',
  },

  accountant: {
    label: 'Accountant / Tax Practitioner', customerLabel: 'Client', bookingLabel: 'Appointment', bookingVerb: 'Book appointment',
    fields: [
      { key: 'service', label: 'Service', type: 'select', options: ['Tax return', 'Annual financials', 'VAT registration', 'CIPC registration', 'Bookkeeping', 'Payroll', 'Tax advisory', 'Audit', 'Other'] },
      { key: 'tax_year', label: 'Tax year', type: 'text', placeholder: '2025/2026' },
      { key: 'fee', label: 'Fee (R)', type: 'number' },
      { key: 'documents', label: 'Documents to bring', type: 'file' },
    ],
    thankYou: 'Your appointment at {businessName} is confirmed, {name}. Please have your documents ready. 📊',
  },

  insurance_broker: {
    label: 'Insurance Broker', customerLabel: 'Client', bookingLabel: 'Consultation', bookingVerb: 'Book consultation',
    fields: [
      { key: 'insurance_type', label: 'Insurance type', type: 'select', options: ['Car', 'Home', 'Life', 'Business', 'Funeral', 'Health', 'Short-term', 'Other'] },
      { key: 'current_provider', label: 'Current provider', type: 'text' },
      { key: 'monthly_premium', label: 'Current premium (R/mo)', type: 'number' },
    ],
    thankYou: 'Thank you for consulting with {businessName}, {name}. We\'ll find the best cover for you. 🛡️',
  },

  estate_agent: {
    label: 'Estate Agent / Property', customerLabel: 'Client', bookingLabel: 'Viewing', bookingVerb: 'Schedule viewing',
    fields: [
      { key: 'property_type', label: 'Property type', type: 'select', options: ['House', 'Flat', 'Townhouse', 'Stand', 'Commercial', 'Farm'] },
      { key: 'transaction', label: 'Transaction', type: 'select', options: ['Buy', 'Sell', 'Rent', 'Let'] },
      { key: 'area', label: 'Preferred area', type: 'text' },
      { key: 'budget', label: 'Budget (R)', type: 'number' },
      { key: 'bedrooms', label: 'Bedrooms', type: 'number' },
    ],
    thankYou: 'Your property viewing with {businessName} is confirmed for {bookingDate}, {name}! 🏡',
  },

  funeral_parlour: {
    label: 'Funeral Parlour', customerLabel: 'Family', bookingLabel: 'Arrangement', bookingVerb: 'Book arrangement',
    fields: [
      { key: 'deceased_name', label: 'Deceased name', type: 'text' },
      { key: 'service_type', label: 'Service', type: 'select', options: ['Full funeral', 'Cremation', 'Memorial', 'Tombstone unveiling', 'Repatriation'] },
      { key: 'funeral_date', label: 'Funeral date', type: 'date' },
      { key: 'venue', label: 'Venue', type: 'text' },
      { key: 'expected_attendees', label: 'Expected attendees', type: 'number' },
      { key: 'total_amount', label: 'Total (R)', type: 'number' },
      { key: 'funeral_policy', label: 'Funeral policy provider', type: 'text' },
    ],
    thankYou: 'Our deepest condolences, {name}. {businessName} will take care of everything with dignity and respect. 🕊️',
  },

  driving_school: {
    label: 'Driving School', customerLabel: 'Learner', bookingLabel: 'Lesson', bookingVerb: 'Book lesson',
    fields: [
      { key: 'licence_type', label: 'Licence type', type: 'select', options: ['Code 8 (car)', 'Code 10 (truck)', 'Code 14 (articulated)', 'Learner\'s test prep', 'Refresher'] },
      { key: 'lesson_duration', label: 'Duration', type: 'select', options: ['1 hour', '2 hours', 'Half day', 'Full day'] },
      { key: 'pickup_location', label: 'Pickup location', type: 'text' },
      { key: 'price', label: 'Price (R)', type: 'number' },
    ],
    thankYou: 'Your driving lesson with {businessName} is booked for {bookingDate}, {name}! Let\'s get you on the road. 🚗',
  },

  photographer: {
    label: 'Photographer / Videographer', customerLabel: 'Client', bookingLabel: 'Shoot', bookingVerb: 'Book shoot',
    fields: [
      { key: 'shoot_type', label: 'Type', type: 'select', options: ['Portrait', 'Wedding', 'Event', 'Product', 'Corporate', 'Matric dance', 'Family', 'Maternity', 'Video', 'Other'] },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'duration', label: 'Duration', type: 'text', placeholder: '2 hours' },
      { key: 'price', label: 'Price (R)', type: 'number' },
      { key: 'deliverables', label: 'Deliverables', type: 'textarea', placeholder: '50 edited photos, 1 reel...' },
    ],
    thankYou: 'Your {shootType} shoot with {businessName} is confirmed for {bookingDate}, {name}! 📸',
  },

  dj: {
    label: 'DJ / Entertainment', customerLabel: 'Client', bookingLabel: 'Gig', bookingVerb: 'Book DJ',
    fields: [
      { key: 'event_type', label: 'Event', type: 'select', options: ['Wedding', 'Birthday', 'Corporate', 'Club night', 'Festival', 'Private party', 'School event', 'Other'] },
      { key: 'venue', label: 'Venue', type: 'text' },
      { key: 'set_duration', label: 'Set duration', type: 'text', placeholder: '4 hours' },
      { key: 'genre', label: 'Music genre', type: 'text', placeholder: 'Amapiano, House, Hip-hop...' },
      { key: 'equipment', label: 'Equipment needed', type: 'select', options: ['I bring everything', 'Need sound system', 'Need lights', 'Need both'] },
      { key: 'price', label: 'Price (R)', type: 'number' },
    ],
    thankYou: 'Booked and ready, {name}! {businessName} will turn up your {eventType}. Let\'s go! 🎧🔥',
  },

  event_planner: {
    label: 'Event Planner / Decor', customerLabel: 'Client', bookingLabel: 'Event', bookingVerb: 'Plan event',
    fields: [
      { key: 'event_type', label: 'Event type', type: 'select', options: ['Wedding', 'Birthday', 'Baby shower', 'Graduation', 'Corporate', 'Funeral after-tears', 'Launch', 'Year-end', 'Other'] },
      { key: 'theme', label: 'Theme / colour scheme', type: 'text' },
      { key: 'venue', label: 'Venue', type: 'text' },
      { key: 'guest_count', label: 'Guest count', type: 'number' },
      { key: 'services', label: 'Services needed', type: 'textarea', placeholder: 'Decor, catering, MC, entertainment, cake...' },
      { key: 'total_budget', label: 'Total budget (R)', type: 'number' },
      { key: 'deposit_paid', label: 'Deposit', type: 'select', options: ['Not yet', 'Partial', 'Paid in full'] },
      { key: 'mood_board', label: 'Mood board / inspiration', type: 'file' },
    ],
    thankYou: 'Your {eventType} planning is underway, {name}! {businessName} is making it unforgettable. ✨🎉',
  },

  printing: {
    label: 'Printing / Signage', customerLabel: 'Customer', bookingLabel: 'Order', bookingVerb: 'Place order',
    fields: [
      { key: 'product', label: 'Product', type: 'select', options: ['Business cards', 'Flyers', 'Banners', 'Posters', 'T-shirt printing', 'Stickers', 'Vehicle branding', 'Shopfront signage', 'Pull-up banner', 'Booklets', 'Other'] },
      { key: 'quantity', label: 'Quantity', type: 'number' },
      { key: 'size', label: 'Size / spec', type: 'text', placeholder: 'A5 flyers, A0 banner...' },
      { key: 'artwork', label: 'Artwork supplied?', type: 'select', options: ['Yes — will email', 'No — need design', 'Partial — need adjustments'] },
      { key: 'total_amount', label: 'Total (R)', type: 'number' },
      { key: 'ready_date', label: 'Ready date', type: 'date' },
      { key: 'file', label: 'Artwork file', type: 'file' },
    ],
    thankYou: 'Your {product} order at {businessName} is confirmed, {name}! Ready by {readyDate}. 🖨️',
  },

  // ═══════════════════════════════════════
  // HOME & PROPERTY (37-44)
  // ═══════════════════════════════════════

  guesthouse: {
    label: 'Guest House / B&B', customerLabel: 'Guest', bookingLabel: 'Reservation', bookingVerb: 'Book room',
    fields: [
      { key: 'check_in', label: 'Check-in', type: 'date' },
      { key: 'check_out', label: 'Check-out', type: 'date' },
      { key: 'room_type', label: 'Room', type: 'text' },
      { key: 'guests_count', label: 'Guests', type: 'number' },
      { key: 'rate_per_night', label: 'Rate/night (R)', type: 'number' },
      { key: 'total_amount', label: 'Total (R)', type: 'number' },
      { key: 'special_requests', label: 'Special requests', type: 'textarea' },
      { key: 'id_document', label: 'ID copy', type: 'file' },
    ],
    thankYou: 'Your stay at {businessName} is confirmed, {name}! Check-in: {checkIn}. Welcome! 🏡',
  },

  plumber: {
    label: 'Plumber', customerLabel: 'Customer', bookingLabel: 'Job', bookingVerb: 'Book job',
    fields: [
      { key: 'issue', label: 'Issue', type: 'select', options: ['Blocked drain', 'Leak', 'Geyser', 'Installation', 'Burst pipe', 'Toilet', 'Maintenance', 'Other'] },
      { key: 'location', label: 'Address', type: 'text' },
      { key: 'urgency', label: 'Urgency', type: 'select', options: ['Emergency (today)', 'Urgent (within 2 days)', 'Scheduled'] },
      { key: 'quote', label: 'Quote (R)', type: 'number' },
    ],
    thankYou: 'Your plumbing job is booked with {businessName}, {name}. We\'ll be there on {bookingDate}! 🔧',
  },

  electrician: {
    label: 'Electrician', customerLabel: 'Customer', bookingLabel: 'Job', bookingVerb: 'Book job',
    fields: [
      { key: 'issue', label: 'Issue', type: 'select', options: ['Power outage', 'Rewiring', 'DB board', 'Lights', 'Prepaid meter', 'Solar installation', 'COC certificate', 'Other'] },
      { key: 'location', label: 'Address', type: 'text' },
      { key: 'urgency', label: 'Urgency', type: 'select', options: ['Emergency', 'Urgent', 'Scheduled'] },
      { key: 'quote', label: 'Quote (R)', type: 'number' },
    ],
    thankYou: 'Your electrical job is booked with {businessName}, {name}! See you on {bookingDate}. ⚡',
  },

  cleaning: {
    label: 'Cleaning Service', customerLabel: 'Client', bookingLabel: 'Clean', bookingVerb: 'Book clean',
    fields: [
      { key: 'service_type', label: 'Service', type: 'select', options: ['Regular clean', 'Deep clean', 'Move-in/out', 'Office clean', 'Post-construction', 'Window cleaning', 'Carpet cleaning', 'Other'] },
      { key: 'property_size', label: 'Property size', type: 'select', options: ['1 bedroom', '2 bedroom', '3 bedroom', '4+ bedroom', 'Office/commercial'] },
      { key: 'location', label: 'Address', type: 'text' },
      { key: 'frequency', label: 'Frequency', type: 'select', options: ['Once-off', 'Weekly', 'Bi-weekly', 'Monthly'] },
      { key: 'price', label: 'Price (R)', type: 'number' },
    ],
    thankYou: 'Your {serviceType} is booked for {bookingDate}, {name}! {businessName} will make it spotless. ✨🧹',
  },

  painter: {
    label: 'Painter / Handyman', customerLabel: 'Customer', bookingLabel: 'Job', bookingVerb: 'Book job',
    fields: [
      { key: 'job_type', label: 'Job', type: 'select', options: ['Interior painting', 'Exterior painting', 'Waterproofing', 'Tiling', 'Plastering', 'General handyman', 'Other'] },
      { key: 'rooms', label: 'Rooms / area', type: 'text', placeholder: '3 bedrooms + lounge' },
      { key: 'location', label: 'Address', type: 'text' },
      { key: 'quote', label: 'Quote (R)', type: 'number' },
      { key: 'start_date', label: 'Start date', type: 'date' },
    ],
    thankYou: 'Your {jobType} job is booked with {businessName}, {name}! Starting {startDate}. 🎨',
  },

  garden: {
    label: 'Gardener / Landscaping', customerLabel: 'Client', bookingLabel: 'Job', bookingVerb: 'Book service',
    fields: [
      { key: 'service', label: 'Service', type: 'select', options: ['Regular maintenance', 'Landscaping', 'Tree felling', 'Irrigation', 'Lawn installation', 'Clean-up', 'Other'] },
      { key: 'frequency', label: 'Frequency', type: 'select', options: ['Once-off', 'Weekly', 'Bi-weekly', 'Monthly'] },
      { key: 'location', label: 'Address', type: 'text' },
      { key: 'price', label: 'Price (R)', type: 'number' },
    ],
    thankYou: 'Garden service booked with {businessName} for {bookingDate}, {name}! 🌱',
  },

  security: {
    label: 'Security Company', customerLabel: 'Client', bookingLabel: 'Service', bookingVerb: 'Request service',
    fields: [
      { key: 'service', label: 'Service', type: 'select', options: ['Armed response', 'CCTV installation', 'Electric fence', 'Guard patrol', 'Alarm system', 'Event security', 'Access control', 'Other'] },
      { key: 'location', label: 'Site address', type: 'text' },
      { key: 'property_type', label: 'Property', type: 'select', options: ['Residential', 'Commercial', 'Industrial', 'Event'] },
      { key: 'monthly_fee', label: 'Monthly fee (R)', type: 'number' },
    ],
    thankYou: 'Your security service with {businessName} is confirmed, {name}. Your safety is our priority. 🔒',
  },

  laundry: {
    label: 'Laundry / Dry Cleaner', customerLabel: 'Customer', bookingLabel: 'Drop-off', bookingVerb: 'Log drop-off',
    fields: [
      { key: 'items', label: 'Items', type: 'textarea', placeholder: '3x shirts, 2x trousers, 1x suit, 1x duvet...' },
      { key: 'service_type', label: 'Service', type: 'select', options: ['Wash & fold', 'Wash & iron', 'Dry clean', 'Ironing only', 'Duvet/blankets', 'Alterations'] },
      { key: 'ready_date', label: 'Ready for collection', type: 'date' },
      { key: 'total_amount', label: 'Total (R)', type: 'number' },
    ],
    thankYou: 'Your laundry is in good hands, {name}! Ready for collection on {readyDate}. {businessName} 👔',
  },

  // ═══════════════════════════════════════
  // AUTOMOTIVE (45-48)
  // ═══════════════════════════════════════

  mechanic: {
    label: 'Mechanic / Auto Workshop', customerLabel: 'Customer', bookingLabel: 'Job', bookingVerb: 'Book service',
    fields: [
      { key: 'vehicle', label: 'Vehicle', type: 'text', placeholder: '2019 Toyota Corolla' },
      { key: 'registration', label: 'Registration', type: 'text', placeholder: 'ABC 123 GP' },
      { key: 'service_type', label: 'Service', type: 'select', options: ['Full service', 'Minor service', 'Brakes', 'Clutch', 'Engine', 'Suspension', 'Electrical', 'Diagnostics', 'Pre-purchase inspection', 'Other'] },
      { key: 'issue', label: 'Issue description', type: 'textarea' },
      { key: 'quote', label: 'Quote (R)', type: 'number' },
      { key: 'ready_date', label: 'Expected completion', type: 'date' },
    ],
    thankYou: 'Your {vehicle} is booked in at {businessName}, {name}! Expected ready: {readyDate}. 🔧🚗',
  },

  car_wash: {
    label: 'Car Wash / Valet', customerLabel: 'Customer', bookingLabel: 'Wash', bookingVerb: 'Book wash',
    fields: [
      { key: 'vehicle', label: 'Vehicle', type: 'text' },
      { key: 'wash_type', label: 'Wash type', type: 'select', options: ['Basic wash', 'Full valet', 'Interior only', 'Exterior + polish', 'Engine wash', 'Upholstery clean'] },
      { key: 'price', label: 'Price (R)', type: 'number' },
    ],
    thankYou: 'Your car wash at {businessName} is booked, {name}! Shine on. 🚗✨',
  },

  panel_beater: {
    label: 'Panel Beater / Body Shop', customerLabel: 'Customer', bookingLabel: 'Job', bookingVerb: 'Book repair',
    fields: [
      { key: 'vehicle', label: 'Vehicle', type: 'text' },
      { key: 'registration', label: 'Registration', type: 'text' },
      { key: 'damage', label: 'Damage description', type: 'textarea' },
      { key: 'insurance_claim', label: 'Insurance claim?', type: 'select', options: ['No — cash', 'Yes — pending', 'Yes — approved'] },
      { key: 'insurer', label: 'Insurance company', type: 'text', showIf: 'insurance_claim=Yes — pending' },
      { key: 'quote', label: 'Quote (R)', type: 'number' },
      { key: 'photos', label: 'Damage photos', type: 'file' },
    ],
    thankYou: 'Your repair is booked at {businessName}, {name}. We\'ll have your {vehicle} looking new again! 🚙',
  },

  towing: {
    label: 'Towing / Roadside Assist', customerLabel: 'Customer', bookingLabel: 'Call-out', bookingVerb: 'Log call-out',
    fields: [
      { key: 'vehicle', label: 'Vehicle', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'destination', label: 'Tow to', type: 'text' },
      { key: 'issue', label: 'Issue', type: 'select', options: ['Breakdown', 'Accident', 'Flat tyre', 'Battery', 'Lockout', 'Other'] },
      { key: 'price', label: 'Price (R)', type: 'number' },
    ],
    thankYou: 'Help is on the way, {name}! {businessName} dispatched. 🚛',
  },

  // ═══════════════════════════════════════
  // EDUCATION & SKILLS (49-52)
  // ═══════════════════════════════════════

  tutor: {
    label: 'Tutor / Private Lessons', customerLabel: 'Student', bookingLabel: 'Lesson', bookingVerb: 'Book lesson',
    fields: [
      { key: 'subject', label: 'Subject', type: 'text', placeholder: 'Maths, Science, English...' },
      { key: 'grade', label: 'Grade / level', type: 'text' },
      { key: 'mode', label: 'Mode', type: 'select', options: ['In-person', 'Online', 'Group class'] },
      { key: 'duration', label: 'Duration', type: 'select', options: ['1 hour', '1.5 hours', '2 hours'] },
      { key: 'price', label: 'Fee (R)', type: 'number' },
    ],
    thankYou: 'Your {subject} lesson with {businessName} is booked for {bookingDate}, {name}! 📚',
  },

  creche: {
    label: 'Crèche / Day Care / ECD', customerLabel: 'Parent', bookingLabel: 'Enrollment', bookingVerb: 'Enroll child',
    fields: [
      { key: 'child_name', label: 'Child\'s name', type: 'text' },
      { key: 'child_age', label: 'Child\'s age', type: 'text' },
      { key: 'programme', label: 'Programme', type: 'select', options: ['Full day', 'Half day (morning)', 'Half day (afternoon)', 'After school'] },
      { key: 'start_date', label: 'Start date', type: 'date' },
      { key: 'monthly_fee', label: 'Monthly fee (R)', type: 'number' },
      { key: 'allergies', label: 'Allergies / medical conditions', type: 'textarea' },
      { key: 'emergency_contact', label: 'Emergency contact', type: 'text' },
    ],
    thankYou: 'Welcome to {businessName}! {childName} is enrolled starting {startDate}. We\'ll take great care. 🧒',
  },

  gym: {
    label: 'Gym / Fitness Studio', customerLabel: 'Member', bookingLabel: 'Session', bookingVerb: 'Book session',
    fields: [
      { key: 'class_type', label: 'Class / session', type: 'select', options: ['PT session', 'Group fitness', 'Yoga', 'Pilates', 'CrossFit', 'Boxing', 'Swimming', 'Assessment', 'Other'] },
      { key: 'trainer', label: 'Trainer', type: 'text' },
      { key: 'membership_type', label: 'Membership', type: 'select', options: ['Day pass', 'Monthly', 'Annual', 'Class pack (10)'] },
      { key: 'price', label: 'Fee (R)', type: 'number' },
    ],
    thankYou: 'Your {classType} at {businessName} is booked for {bookingDate}, {name}! Let\'s go! 💪🏋️',
  },

  music_teacher: {
    label: 'Music Teacher / School', customerLabel: 'Student', bookingLabel: 'Lesson', bookingVerb: 'Book lesson',
    fields: [
      { key: 'instrument', label: 'Instrument', type: 'select', options: ['Piano', 'Guitar', 'Drums', 'Vocals', 'Violin', 'Saxophone', 'Music theory', 'Other'] },
      { key: 'level', label: 'Level', type: 'select', options: ['Beginner', 'Intermediate', 'Advanced', 'Grade exam prep'] },
      { key: 'duration', label: 'Duration', type: 'select', options: ['30 min', '45 min', '1 hour'] },
      { key: 'price', label: 'Fee (R)', type: 'number' },
    ],
    thankYou: 'Your {instrument} lesson at {businessName} is confirmed for {bookingDate}, {name}! 🎵',
  },

  // ═══════════════════════════════════════
  // TRANSPORT & LOGISTICS (53-55)
  // ═══════════════════════════════════════

  courier: {
    label: 'Courier / Delivery Service', customerLabel: 'Customer', bookingLabel: 'Delivery', bookingVerb: 'Book delivery',
    fields: [
      { key: 'pickup', label: 'Pickup address', type: 'text' },
      { key: 'dropoff', label: 'Drop-off address', type: 'text' },
      { key: 'package_description', label: 'Package description', type: 'textarea' },
      { key: 'weight', label: 'Estimated weight (kg)', type: 'number' },
      { key: 'urgency', label: 'Urgency', type: 'select', options: ['Same day', 'Next day', 'Standard (2-3 days)'] },
      { key: 'price', label: 'Price (R)', type: 'number' },
    ],
    thankYou: 'Your delivery is booked with {businessName}, {name}! We\'ll get it there safely. 📦🚚',
  },

  transport: {
    label: 'Transport / Shuttle', customerLabel: 'Passenger', bookingLabel: 'Trip', bookingVerb: 'Book trip',
    fields: [
      { key: 'pickup', label: 'Pickup point', type: 'text' },
      { key: 'destination', label: 'Destination', type: 'text' },
      { key: 'passengers', label: 'Passengers', type: 'number' },
      { key: 'vehicle_type', label: 'Vehicle', type: 'select', options: ['Sedan', 'SUV', 'Minibus', 'Bus'] },
      { key: 'trip_type', label: 'Trip type', type: 'select', options: ['One-way', 'Return', 'Airport transfer', 'Daily contract'] },
      { key: 'price', label: 'Price (R)', type: 'number' },
    ],
    thankYou: 'Your trip with {businessName} is confirmed for {bookingDate}, {name}! 🚐',
  },

  moving: {
    label: 'Removals / Moving Company', customerLabel: 'Customer', bookingLabel: 'Move', bookingVerb: 'Book move',
    fields: [
      { key: 'from_address', label: 'Moving from', type: 'text' },
      { key: 'to_address', label: 'Moving to', type: 'text' },
      { key: 'property_size', label: 'Property size', type: 'select', options: ['Bachelor', '1 bedroom', '2 bedroom', '3 bedroom', '4+ bedroom', 'Office'] },
      { key: 'truck_size', label: 'Truck needed', type: 'select', options: ['1-ton bakkie', '4-ton', '8-ton', 'Not sure'] },
      { key: 'packing', label: 'Packing service?', type: 'select', options: ['No — I\'ll pack', 'Yes — please pack'] },
      { key: 'quote', label: 'Quote (R)', type: 'number' },
    ],
    thankYou: 'Your move with {businessName} is booked for {bookingDate}, {name}! We\'ll handle everything with care. 📦🏠',
  },

  // ═══════════════════════════════════════
  // MINING & INDUSTRIAL (56-57)
  // ═══════════════════════════════════════

  mining: {
    label: 'Mining / Quarry', customerLabel: 'Buyer', bookingLabel: 'Delivery', bookingVerb: 'Schedule delivery',
    fields: [
      { key: 'mineral_type', label: 'Product', type: 'text', placeholder: 'Chrome, sand, gravel...' },
      { key: 'tonnage', label: 'Tonnage (MT)', type: 'number' },
      { key: 'truck_reg', label: 'Truck reg', type: 'text' },
      { key: 'delivery_site', label: 'Delivery site', type: 'text' },
      { key: 'price_per_ton', label: 'Price/ton (R)', type: 'number' },
      { key: 'total_amount', label: 'Total (R)', type: 'number' },
      { key: 'weighbridge_slip', label: 'Weighbridge slip', type: 'file' },
    ],
    thankYou: '{tonnage}MT of {mineralType} confirmed for delivery, {name}. {businessName} values your partnership.',
  },

  welding: {
    label: 'Welding / Steel Fabrication', customerLabel: 'Customer', bookingLabel: 'Job', bookingVerb: 'Book job',
    fields: [
      { key: 'job_type', label: 'Job', type: 'select', options: ['Gate', 'Burglar bars', 'Carport', 'Trailer', 'Balustrade', 'Industrial fabrication', 'Repair', 'Custom', 'Other'] },
      { key: 'material', label: 'Material', type: 'select', options: ['Mild steel', 'Stainless steel', 'Aluminium'] },
      { key: 'dimensions', label: 'Dimensions / spec', type: 'textarea' },
      { key: 'quote', label: 'Quote (R)', type: 'number' },
      { key: 'start_date', label: 'Start date', type: 'date' },
      { key: 'drawing', label: 'Drawing / photo', type: 'file' },
    ],
    thankYou: 'Your {jobType} job is confirmed with {businessName}, {name}! Starting {startDate}. 🔥🔨',
  },

  // ═══════════════════════════════════════
  // TECHNOLOGY & DIGITAL (58-59)
  // ═══════════════════════════════════════

  it_support: {
    label: 'IT Support / Computer Repair', customerLabel: 'Customer', bookingLabel: 'Job', bookingVerb: 'Log job',
    fields: [
      { key: 'device', label: 'Device', type: 'select', options: ['Desktop PC', 'Laptop', 'Phone', 'Printer', 'Network', 'Server', 'CCTV', 'Other'] },
      { key: 'issue', label: 'Issue', type: 'textarea' },
      { key: 'urgency', label: 'Urgency', type: 'select', options: ['Critical — business down', 'High — affecting work', 'Normal', 'Low — when convenient'] },
      { key: 'quote', label: 'Quote (R)', type: 'number' },
    ],
    thankYou: 'Your IT support request is logged with {businessName}, {name}. We\'re on it! 💻',
  },

  cell_repair: {
    label: 'Cellphone Repair', customerLabel: 'Customer', bookingLabel: 'Repair', bookingVerb: 'Log repair',
    fields: [
      { key: 'device', label: 'Device', type: 'text', placeholder: 'iPhone 15, Samsung S24...' },
      { key: 'imei', label: 'IMEI number', type: 'text' },
      { key: 'issue', label: 'Issue', type: 'select', options: ['Screen replacement', 'Battery', 'Charging port', 'Water damage', 'Software', 'Back cover', 'Camera', 'Other'] },
      { key: 'quote', label: 'Quote (R)', type: 'number' },
      { key: 'ready_date', label: 'Ready date', type: 'date' },
    ],
    thankYou: 'Your {device} repair is in progress at {businessName}, {name}! Ready by {readyDate}. 📱',
  },

  // ═══════════════════════════════════════
  // AGRICULTURE (60)
  // ═══════════════════════════════════════

  farming: {
    label: 'Farm / Agriculture', customerLabel: 'Buyer', bookingLabel: 'Order', bookingVerb: 'Place order',
    fields: [
      { key: 'product', label: 'Product', type: 'text', placeholder: 'Chickens, eggs, vegetables, cattle...' },
      { key: 'quantity', label: 'Quantity', type: 'text', placeholder: '50 chickens, 30 trays eggs...' },
      { key: 'total_amount', label: 'Total (R)', type: 'number' },
      { key: 'delivery', label: 'Delivery', type: 'select', options: ['Collection from farm', 'Delivery'] },
      { key: 'delivery_date', label: 'Date', type: 'date' },
    ],
    thankYou: 'Your order from {businessName} is confirmed, {name}! Fresh from the farm. 🌾🐔',
  },

  // ═══════════════════════════════════════
  // DEFAULT (catch-all)
  // ═══════════════════════════════════════

  default: {
    label: 'General Business', customerLabel: 'Customer', bookingLabel: 'Booking', bookingVerb: 'New booking',
    fields: [
      { key: 'service', label: 'Service / product', type: 'text' },
      { key: 'amount', label: 'Amount (R)', type: 'number' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    thankYou: 'Thank you for choosing {businessName}, {name}! We appreciate your support and look forward to serving you again.',
  },
};

// ═══════════════════════════════════════
// INDUSTRY LOOKUP MAP
// Maps common terms to config keys
// ═══════════════════════════════════════

export const INDUSTRY_MAP = {
  // Food
  'butchery': 'butchery', 'butcher': 'butchery', 'meat': 'butchery',
  'bakery': 'bakery', 'baker': 'bakery', 'confectionery': 'bakery', 'cake': 'bakery', 'cakes': 'bakery',
  'restaurant': 'restaurant', 'takeaway': 'restaurant', 'take away': 'restaurant', 'fast food': 'restaurant', 'cafe': 'restaurant', 'coffee shop': 'restaurant',
  'catering': 'catering', 'caterer': 'catering',
  'spaza': 'spaza', 'tuck shop': 'spaza', 'tuckshop': 'spaza', 'convenience': 'spaza',
  'liquor': 'liquor_store', 'bottle store': 'liquor_store', 'tavern': 'liquor_store', 'shebeen': 'liquor_store',
  'food truck': 'food_truck', 'street food': 'food_truck',
  'fruit': 'fruit_veg', 'vegetable': 'fruit_veg', 'greengrocer': 'fruit_veg', 'produce': 'fruit_veg',

  // Beauty
  'salon': 'salon', 'hair': 'salon', 'hairdresser': 'salon',
  'barber': 'barber', 'barbershop': 'barber',
  'nails': 'nail_tech', 'nail tech': 'nail_tech', 'nail technician': 'nail_tech', 'manicure': 'nail_tech',
  'lash': 'lash_tech', 'lashes': 'lash_tech', 'lash tech': 'lash_tech', 'eyelash': 'lash_tech',
  'spa': 'spa', 'wellness': 'spa', 'massage': 'spa',
  'makeup': 'makeup_artist', 'mua': 'makeup_artist', 'makeup artist': 'makeup_artist',

  // Fashion
  'dressmaker': 'dressmaker', 'tailor': 'dressmaker', 'seamstress': 'dressmaker', 'fashion': 'dressmaker', 'clothing': 'dressmaker',
  'shoemaker': 'shoemaker', 'cobbler': 'shoemaker', 'shoe repair': 'shoemaker', 'shoe': 'shoemaker', 'shoes': 'shoemaker',
  'clothing store': 'clothing_store', 'boutique': 'clothing_store',
  'jeweller': 'jeweller', 'jewellery': 'jeweller', 'jewelry': 'jeweller', 'accessories': 'jeweller',
  'florist': 'florist', 'flowers': 'florist',

  // Health
  'doctor': 'doctor', 'gp': 'doctor', 'medical practice': 'doctor', 'clinic': 'doctor',
  'dentist': 'dentist', 'dental': 'dentist',
  'physio': 'physiotherapist', 'physiotherapy': 'physiotherapist', 'chiropractor': 'physiotherapist',
  'optometrist': 'optometrist', 'optician': 'optometrist', 'eye': 'optometrist',
  'pharmacy': 'pharmacy', 'chemist': 'pharmacy',
  'traditional healer': 'traditional_healer', 'herbalist': 'traditional_healer', 'sangoma': 'traditional_healer', 'inyanga': 'traditional_healer',

  // Professional
  'lawyer': 'lawyer', 'attorney': 'lawyer', 'legal': 'lawyer', 'advocate': 'lawyer',
  'accountant': 'accountant', 'accounting': 'accountant', 'tax': 'accountant', 'bookkeeper': 'accountant',
  'insurance': 'insurance_broker', 'insurance broker': 'insurance_broker',
  'estate agent': 'estate_agent', 'property': 'estate_agent', 'real estate': 'estate_agent',
  'funeral': 'funeral_parlour', 'funeral parlour': 'funeral_parlour', 'undertaker': 'funeral_parlour',
  'driving school': 'driving_school', 'driving': 'driving_school',
  'photographer': 'photographer', 'photography': 'photographer', 'videographer': 'photographer',
  'dj': 'dj', 'entertainment': 'dj', 'events dj': 'dj',
  'event planner': 'event_planner', 'events': 'event_planner', 'decor': 'event_planner', 'party planner': 'event_planner',
  'printing': 'printing', 'signage': 'printing', 'print shop': 'printing',

  // Home
  'guesthouse': 'guesthouse', 'guest house': 'guesthouse', 'bnb': 'guesthouse', 'b&b': 'guesthouse', 'lodge': 'guesthouse', 'accommodation': 'guesthouse', 'hotel': 'guesthouse', 'airbnb': 'guesthouse',
  'plumber': 'plumber', 'plumbing': 'plumber',
  'electrician': 'electrician', 'electrical': 'electrician',
  'cleaning': 'cleaning', 'cleaner': 'cleaning', 'maid service': 'cleaning',
  'painter': 'painter', 'painting': 'painter', 'handyman': 'painter',
  'garden': 'garden', 'gardener': 'garden', 'landscaping': 'garden',
  'security': 'security', 'security company': 'security', 'armed response': 'security',
  'laundry': 'laundry', 'dry cleaner': 'laundry', 'laundromat': 'laundry',

  // Automotive
  'mechanic': 'mechanic', 'garage': 'mechanic', 'auto': 'mechanic', 'workshop': 'mechanic',
  'car wash': 'car_wash', 'carwash': 'car_wash', 'valet': 'car_wash',
  'panel beater': 'panel_beater', 'body shop': 'panel_beater', 'spray painting': 'panel_beater',
  'towing': 'towing', 'tow truck': 'towing', 'roadside': 'towing',

  // Education
  'tutor': 'tutor', 'tutoring': 'tutor', 'lessons': 'tutor', 'private lessons': 'tutor',
  'creche': 'creche', 'daycare': 'creche', 'day care': 'creche', 'ecd': 'creche', 'preschool': 'creche',
  'gym': 'gym', 'fitness': 'gym', 'personal trainer': 'gym', 'crossfit': 'gym',
  'music': 'music_teacher', 'music school': 'music_teacher', 'music teacher': 'music_teacher',

  // Transport
  'courier': 'courier', 'delivery': 'courier', 'delivery service': 'courier',
  'transport': 'transport', 'shuttle': 'transport', 'taxi': 'transport',
  'moving': 'moving', 'removals': 'moving', 'movers': 'moving',

  // Industrial
  'mining': 'mining', 'quarry': 'mining', 'mine': 'mining',
  'welding': 'welding', 'welder': 'welding', 'fabrication': 'welding', 'steel': 'welding',

  // Tech
  'it': 'it_support', 'it support': 'it_support', 'computer': 'it_support', 'computer repair': 'it_support',
  'cellphone': 'cell_repair', 'phone repair': 'cell_repair', 'cell repair': 'cell_repair', 'screen repair': 'cell_repair',

  // Agriculture
  'farming': 'farming', 'farm': 'farming', 'agriculture': 'farming', 'poultry': 'farming', 'livestock': 'farming',
};

export function getIndustryConfig(industry) {
  if (!industry) return INDUSTRY_CONFIG.default;
  const normalized = industry.toLowerCase().trim();
  const key = INDUSTRY_MAP[normalized];
  if (key && INDUSTRY_CONFIG[key]) return INDUSTRY_CONFIG[key];
  // Fuzzy match — check if any map key is contained in the industry string
  for (const [term, configKey] of Object.entries(INDUSTRY_MAP)) {
    if (normalized.includes(term) && INDUSTRY_CONFIG[configKey]) return INDUSTRY_CONFIG[configKey];
  }
  return INDUSTRY_CONFIG.default;
}

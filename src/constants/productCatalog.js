import { ADD_ON_CATALOG } from './addOnCatalog.js';

export const PACKAGE_CATALOG = [
  { code: 'ignite', name: 'Ignite', setup: 4500, monthly: 498.99, type: 'package',
    features: ['1-page website', 'Domain + email', 'Google Business Profile', '8 social posts/mo', 'Monthly report'] },
  { code: 'accelerate', name: 'Accelerate', setup: 6500, monthly: 890, type: 'package',
    features: ['3-5 page website', 'E-commerce catalog', 'Google + Meta Ads setup', '12 posts/mo', 'Quarterly strategy call'] },
  { code: 'dominate', name: 'Dominate', setup: 9800, monthly: 1490, type: 'package',
    features: ['Up to 10 pages', 'Blog + SEO', 'Google + Meta Ads launched', '16 posts/mo', 'Monthly strategy call', 'Business cards'] },
  { code: 'street_pulse', name: 'Street Pulse', setup: 700, monthly: 4000, type: 'package',
    features: ['2 branded agents', '1,000 flyers/mo', 'Branded transport', 'Photo evidence', '3-month lock'] },
  { code: 'township_pulse', name: 'Township Pulse', setup: 2200, monthly: 0, type: 'package',
    features: ['300 flyers', '5 posters', '1 deployment day', 'Photo report', 'Once-off'] },
];

export const FULL_CATALOG = [...PACKAGE_CATALOG, ...ADD_ON_CATALOG];

import React from 'react';
import { PolicyScreen, PolicySection } from '@/components/PolicyScreen';

const sections: PolicySection[] = [
  {
    body: 'Penn Pal ("we", "us") is committed to protecting your privacy. This policy explains what information we collect, why we collect it, and how we use it.',
  },
  {
    heading: '1. Information we collect',
    body: 'When you create an account we collect your .edu email address and graduation year. You may optionally share a brief prompt about what you are going through. We store messages you send within the app. We do not collect your real name, phone number, location, or any social media identifiers.',
  },
  {
    heading: '2. How we use your information',
    body: 'Your email and graduation year are used solely to create your account and match you with a partner in your graduating class. Your messages are stored in order to deliver them to your matched partner and to allow moderation if a report is filed. We do not sell, rent, or share your personal data with third parties for marketing purposes.',
  },
  {
    heading: '3. Anonymity',
    body: 'Penn Pal is designed to be anonymous. Your matched partner never sees your email address or graduation year. Automated filters prevent identity-revealing content from being sent. Your identity is protected until you choose to reveal it, if ever.',
  },
  {
    heading: '4. Data retention',
    body: 'Your account data and messages are retained for the duration of your account. If you delete your account, your profile is anonymised and your auth credentials are removed. Message content may be retained in anonymised form for safety and moderation purposes.',
  },
  {
    heading: '5. Security',
    body: 'We use Supabase to store your data, which encrypts data in transit (TLS) and at rest. Row Level Security ensures you can only access data belonging to your account and your matched pair. We do not store passwords in plain text.',
  },
  {
    heading: '6. Children',
    body: 'Penn Pal is intended for college students. We do not knowingly collect information from users under the age of 13. If you believe a minor has created an account, please contact support@pennpal.app.',
  },
  {
    heading: '7. Changes to this policy',
    body: 'We may update this policy from time to time. We will notify you of significant changes via the app. Continued use of Penn Pal after changes constitutes acceptance of the updated policy.',
  },
  {
    heading: '8. Contact',
    body: 'Questions? Email us at support@pennpal.app.',
  },
];

export default function PrivacyScreen() {
  return (
    <PolicyScreen
      title="Privacy Policy"
      lastUpdated="April 2026"
      sections={sections}
    />
  );
}

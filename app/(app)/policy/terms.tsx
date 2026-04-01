import React from 'react';
import { PolicyScreen, PolicySection } from '@/components/PolicyScreen';

const sections: PolicySection[] = [
  {
    body: 'By using Penn Pal you agree to these Terms of Service. Please read them carefully.',
  },
  {
    heading: '1. Eligibility',
    body: 'You must be a current college student with a valid .edu email address to use Penn Pal. By creating an account you represent that this is true.',
  },
  {
    heading: '2. Account',
    body: 'You are responsible for maintaining the security of your password. You may not share your account with another person. Each student is limited to one account.',
  },
  {
    heading: '3. Acceptable use',
    body: 'Penn Pal is a private emotional support platform. You agree not to use it to harass, threaten, or abuse your matched partner; share sexually explicit content; attempt to identify your matched partner before graduation; spam or send unsolicited commercial messages; circumvent any safety or technical measures; or violate any applicable law.',
  },
  {
    heading: '4. Anonymous match',
    body: 'You are matched with one partner per matching cycle. We do not guarantee a match will be available immediately. Matches are made by graduation year only. We do not guarantee any particular quality or compatibility of match.',
  },
  {
    heading: '5. Reporting and moderation',
    body: 'We reserve the right to review conversations that have been reported, to ban accounts that violate these terms, and to preserve data for safety and legal purposes. Reporting a conversation does not guarantee action.',
  },
  {
    heading: '6. Disclaimers',
    body: 'Penn Pal is not a mental health service, crisis line, or substitute for professional help. If you are in crisis please contact 988 (US) or your local emergency services. We provide the service "as is" without warranty of any kind.',
  },
  {
    heading: '7. Limitation of liability',
    body: 'To the maximum extent permitted by law, Penn Pal and its creators shall not be liable for any indirect, incidental, or consequential damages arising out of your use of the app.',
  },
  {
    heading: '8. Changes',
    body: 'We may modify these terms at any time. Continued use of the app after changes constitutes acceptance. We will provide notice of material changes within the app.',
  },
  {
    heading: '9. Contact',
    body: 'For questions about these terms, contact support@pennpal.app.',
  },
];

export default function TermsScreen() {
  return (
    <PolicyScreen
      title="Terms of Service"
      lastUpdated="April 2026"
      sections={sections}
    />
  );
}

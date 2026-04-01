import React from 'react';
import { PolicyScreen, PolicySection } from '@/components/PolicyScreen';

const sections: PolicySection[] = [
  {
    body: 'Penn Pal is built on trust and human connection. These guidelines exist to keep it that way. Violating them may result in your account being suspended or removed.',
  },
  {
    heading: 'Be kind',
    body: 'Your Penn Pal is a real person going through their own college journey. Treat them with the same respect you would want. Harassment, insults, and cruelty of any kind will not be tolerated.',
  },
  {
    heading: 'Stay anonymous',
    body: 'Do not share your real name, phone number, email, social media handles, school name, or any other information that could identify you. This protects both of you and preserves what makes Penn Pal special. Automated filters are in place, but they are not perfect — please act in good faith.',
  },
  {
    heading: 'No explicit content',
    body: 'Penn Pal is not a dating or adult platform. Sexual content, solicitation, or any content inappropriate for a general audience is prohibited.',
  },
  {
    heading: 'No threats or violence',
    body: 'Threatening language, encouragement of self-harm, or any content that could endanger you or your partner is prohibited. If you or someone else is in immediate danger, please call emergency services.',
  },
  {
    heading: 'No spam',
    body: 'Repeated, irrelevant, or automated messages are not allowed.',
  },
  {
    heading: 'Use the tools provided',
    body: 'If you are uncomfortable with a conversation, use the "Block and rematch" option to leave safely. If you believe a conversation violates these guidelines, tap "Report conversation" so our team can review it. We take all reports seriously.',
  },
  {
    heading: 'Mental health',
    body: 'Penn Pal is a peer connection, not a substitute for professional mental health support. If you or your partner appear to be in crisis, please share the 988 Suicide & Crisis Lifeline (call or text 988 in the US) or encourage them to seek professional help.',
  },
  {
    heading: 'Enforcement',
    body: 'We review reported conversations and reserve the right to remove content, ban accounts, or involve authorities if necessary. We aim to be fair and consistent.',
  },
];

export default function GuidelinesScreen() {
  return (
    <PolicyScreen
      title="Community Guidelines"
      lastUpdated="April 2026"
      sections={sections}
    />
  );
}

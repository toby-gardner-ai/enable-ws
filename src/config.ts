// Site-wide details. Edit these first: every page reads from here.
export const SITE = {
  name: 'Toby Gardner', // TODO: confirm how you want your name shown
  title: 'Toby Gardner · AI Enablement',
  // StoryBrand one-liner: problem → solution → result.
  oneLiner:
    'Most companies know AI matters but get stuck between the demo and real results. I help teams design, build and integrate AI that solves an actual business problem, so you get value in weeks, not years.',
  description:
    'AI enablement for companies: strategy, hands-on builds and integration that turn AI from a buzzword into measurable results.',
  email: 'hello@example.com', // TODO: your contact email
  bookingUrl: '/contact', // TODO: swap for a Cal.com / Calendly link if you use one
  linkedin: 'https://www.linkedin.com/in/your-profile', // TODO
  github: 'https://github.com/toby-gardner-ai',
};

type NavItem = { href: string; label: string; children?: { href: string; label: string; text: string }[] };

export const NAV: NavItem[] = [
  { href: '/services', label: 'Services' },
  { href: '/work', label: 'Work' },
  {
    href: '/resources',
    label: 'AI Enablement',
    children: [
      { href: '/resources', label: 'Free resources', text: 'Checklists, templates and guides' },
      { href: '/readiness', label: 'Readiness Checklist', text: 'Score how ready you are to run AI in production' },
      { href: '/glossary', label: 'Glossary', text: 'AI governance terms in plain English' },
      { href: '/subjects', label: 'Subjects', text: 'What AI governance covers, subject by subject' },
    ],
  },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
];

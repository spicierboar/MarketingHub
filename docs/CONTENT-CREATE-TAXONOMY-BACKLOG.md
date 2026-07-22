# Content Create — taxonomy backlog (catalogue)

**Status:** Catalogue only. **Design + V1 local implementation** — see [`CONTENT-CREATE-TAXONOMY-DESIGN.md`](./CONTENT-CREATE-TAXONOMY-DESIGN.md).  
**Source:** User brief 2026-07-21 (investor smoke session).  
**Constraint:** Do not dump this list into independent dropdowns. Implement only via the design’s compatibility graph + cook families.

## Product rules

- AI drafts → user reviews → admin approves → export. Nothing unapproved is published.
- Staging demo fill / fixture tools stay off the live product.
- AEO, GEO, LLMO, SEO, and conversion optimisation belong under **Optimise for**, not under Content type.

## Recommended UI hierarchy

Do **not** put every option in one dropdown. Use:

1. Create for
2. Content category
3. Content type
4. Channel or platform
5. Primary objective
6. Audience
7. Funnel stage
8. Optimise for
9. Search or AI discovery target
10. Tone and voice
11. Length and structure
12. Evidence and sources
13. Brand controls
14. Compliance controls
15. Output options

## Implementation notes (when unparked)

- Progressive disclosure: category → type → channel-aware fields
- Persist taxonomy enums / join tables in Supabase (migration + RLS-aware)
- Map generate / brief payloads through `@/lib/db` (async) + audit on material actions
- Brand / compliance / restricted controls should gate or annotate drafts, not just decorate the form
- Start with a design pass (IA + which axes are v1 vs later), then schema, then UI

---

## Full taxonomy (authoritative list)

### 1. Create For

- Client
- Industry
- General
- Internal organisation
- Personal brand
- Campaign
- Product or service
- Event
- Location or market

### 2. Content Type

#### A. Social Media

- Social media post
- Social media caption
- Social media thread
- Social media carousel
- Social media campaign
- Social media content series
- LinkedIn post
- LinkedIn article
- LinkedIn newsletter
- X post
- X thread
- Facebook post
- Instagram caption
- Instagram carousel
- Instagram Reel caption
- TikTok caption
- YouTube Community post
- Pinterest description
- Reddit post
- Community forum post
- Social media poll
- Social media question
- Social media announcement
- Social media response
- Social media content calendar

#### B. Articles and Editorial

- Blog article
- News article
- Feature article
- Opinion article
- Thought-leadership article
- Industry commentary
- Expert commentary
- Editorial
- Column
- Listicle
- How-to article
- Tutorial
- Explainer article
- Educational article
- Guide
- Ultimate guide
- Beginner guide
- Advanced guide
- Resource article
- Trend article
- Predictions article
- Research summary
- Data-led article
- Interview article
- Q&A article
- Round-up article
- Event recap
- Product review
- Service review
- Book review
- Case analysis
- Myth-versus-fact article
- Pros-and-cons article

#### C. Website Content

- Website page copy
- Homepage copy
- About page
- Contact page
- Services page
- Service detail page
- Product page
- Product description
- Product category page
- Industry page
- Sector page
- Location page
- Team page
- Biography page
- Careers page
- Recruitment page
- Resources page
- Pricing page
- Features page
- Benefits page
- Process page
- Methodology page
- Portfolio page
- Testimonials page
- Case studies page
- Partners page
- Sustainability page
- Corporate responsibility page
- Investor relations page
- Media page
- Newsroom page
- Help centre page
- Knowledge-base article
- Support article
- Glossary page
- Definition page
- Pillar page
- Topic-cluster page
- Comparison page
- Alternatives page
- Integration page
- Marketplace listing
- App-store listing
- Error-page copy
- Maintenance-page copy
- Thank-you page
- Confirmation page
- Cookie banner copy
- Website notification
- Pop-up copy
- Exit-intent pop-up
- Live-chat greeting
- Chatbot response
- Website microcopy

#### D. Landing Pages and Conversion Content

- Landing page copy
- Lead-generation landing page
- Product-launch landing page
- Service landing page
- Event landing page
- Webinar landing page
- Download landing page
- Waitlist page
- Coming-soon page
- Sales page
- Squeeze page
- Registration page
- Booking page
- Free-trial page
- Demo-request page
- Consultation page
- Checkout-page copy
- Upsell-page copy
- Cross-sell-page copy
- Confirmation-page copy
- Call-to-action copy
- Headline options
- Subheading options
- Value proposition
- Hero-section copy
- Benefits section
- Objection-handling section
- Trust section
- Social-proof section
- Pricing copy
- Guarantee copy
- Form copy
- Form-field labels
- Button copy

#### E. Email Content

- Email newsletter
- Newsletter article
- Newsletter introduction
- Newsletter summary
- Marketing email
- Promotional email
- Sales email
- Cold email
- Prospecting email
- Follow-up email
- Client email
- Customer-service email
- Welcome email
- Onboarding email
- Nurture email
- Re-engagement email
- Abandoned-cart email
- Product-launch email
- Event-invitation email
- Webinar email
- Reminder email
- Confirmation email
- Thank-you email
- Feedback-request email
- Review-request email
- Referral-request email
- Renewal email
- Retention email
- Upsell email
- Cross-sell email
- Transactional email
- Account-notification email
- Internal email
- Executive email
- Email sequence
- Drip campaign
- Automated email workflow
- Email subject lines
- Email preview text
- Email signature
- Out-of-office message

#### F. Advertising

- Ad copy
- Search ad
- Display ad
- Social media ad
- LinkedIn ad
- Facebook ad
- Instagram ad
- X ad
- TikTok ad
- YouTube ad
- Native ad
- Programmatic ad
- Retargeting ad
- Recruitment ad
- Print ad
- Radio ad
- Podcast ad
- Video ad
- Pre-roll ad
- Outdoor ad
- Billboard copy
- Transit ad
- Classified ad
- Sponsored-content copy
- Advertorial
- Product-listing ad
- App-install ad
- Lead-generation ad
- Ad headline
- Ad description
- Ad variations
- Campaign slogan
- Tagline

#### G. Video and Audio

- Video script
- Short-form video script
- Long-form video script
- Explainer video script
- Brand video script
- Corporate video script
- Product video script
- Demonstration video script
- Testimonial video script
- Training video script
- Recruitment video script
- Social media video script
- TikTok script
- Instagram Reel script
- YouTube video script
- YouTube Short script
- Webinar script
- Livestream script
- Podcast script
- Podcast episode outline
- Podcast introduction
- Podcast show notes
- Podcast description
- Voice-over script
- Radio script
- Audio-ad script
- Video title
- Video description
- Video chapter titles
- Video thumbnail text
- Subtitle copy
- Closed-caption copy

#### H. Sales and Business Development

- Sales proposal
- Business proposal
- Client proposal
- Tender response
- Request-for-proposal response
- Pitch document
- Pitch-deck copy
- Sales presentation
- Capability statement
- Statement of qualifications
- Executive summary
- Company profile
- Service overview
- Product overview
- Sales brochure
- Sales sheet
- One-pager
- Product sheet
- Service sheet
- Battlecard
- Competitor comparison
- Objection-handling guide
- Sales call script
- Discovery-call questions
- Demo script
- Elevator pitch
- Value proposition
- Unique selling proposition
- Outreach message
- LinkedIn prospecting message
- Direct message
- Follow-up message
- Meeting-request message
- Partnership proposal
- Sponsorship proposal
- Referral proposal
- Account plan
- Customer success plan
- Renewal proposal

#### I. Public Relations and Corporate Communications

- Press release
- Media release
- News release
- Corporate announcement
- Product-launch announcement
- Partnership announcement
- Appointment announcement
- Award announcement
- Funding announcement
- Event announcement
- Crisis statement
- Holding statement
- Public statement
- Official response
- Media briefing
- Media pitch
- Journalist pitch
- Press-kit copy
- Media fact sheet
- Corporate fact sheet
- Spokesperson briefing
- Talking points
- Key messages
- Frequently asked media questions
- Executive quotation
- Founder statement
- Chairman statement
- CEO message
- Annual-review message
- Stakeholder update
- Investor update
- Community announcement
- Reputation-management response

#### J. Reports and Research

- Report
- Research report
- Industry report
- Market report
- Trend report
- Benchmark report
- Survey report
- Annual report
- Quarterly report
- Monthly report
- Performance report
- Campaign report
- Analytics report
- Audit report
- Assessment report
- Evaluation report
- Due-diligence summary
- Findings report
- Recommendation report
- Consultation report
- Impact report
- Sustainability report
- White paper
- Green paper
- Position paper
- Policy paper
- Briefing paper
- Research paper
- Literature review
- Evidence review
- Data summary
- Statistical commentary
- Research abstract
- Research methodology
- Research findings
- Research conclusion
- Executive briefing
- Board briefing
- Issue brief
- Fact sheet
- Research questionnaire
- Survey questions

#### K. Case Studies and Proof Content

- Case study
- Client success story
- Customer success story
- Project case study
- Product case study
- Service case study
- Transformation story
- Before-and-after story
- Implementation story
- Use case
- Customer testimonial
- Client testimonial
- Employee testimonial
- Partner testimonial
- Review summary
- Results summary
- Proof-point summary
- Awards submission
- Industry-entry submission
- Accreditation submission

#### L. Educational and Training Content

- Course outline
- Course module
- Lesson plan
- Training guide
- Training manual
- Facilitator guide
- Participant workbook
- Workshop outline
- Workshop exercise
- Seminar outline
- Webinar outline
- Presentation notes
- Lecture notes
- Study guide
- Revision guide
- Learning objectives
- Learning outcomes
- Assessment questions
- Quiz
- Multiple-choice questions
- Discussion questions
- Practical exercise
- Scenario exercise
- Role-play exercise
- Certification material
- Onboarding guide
- Employee handbook
- Process guide
- How-to instructions
- Standard operating procedure
- Checklist
- Cheat sheet
- Reference guide

#### M. Internal Communications

- Internal announcement
- Staff update
- Company newsletter
- Department update
- Team briefing
- Executive update
- Leadership message
- Change-management communication
- Organisational-change notice
- Policy announcement
- Procedure announcement
- Internal memo
- Board memo
- Meeting agenda
- Meeting minutes
- Meeting summary
- Action-item summary
- Project update
- Status report
- Progress report
- Internal FAQ
- Employee communication
- Staff-recognition message
- Employee-engagement message
- Internal campaign
- Intranet article
- Internal survey
- Town-hall script
- Presentation script
- Talking points
- Crisis communication
- Incident notification
- Business-continuity communication

#### N. Human Resources and Recruitment

- Job advertisement
- Job description
- Person specification
- Role profile
- Recruitment campaign
- Careers-page copy
- Employer-branding content
- Candidate email
- Interview invitation
- Interview questions
- Screening questions
- Candidate rejection message
- Offer-letter content
- Onboarding communication
- Employee welcome message
- Induction guide
- Performance-review template
- Employee survey
- Staff policy
- Workplace procedure
- Training announcement
- Employee recognition
- Internal vacancy notice
- Graduate-programme copy
- Internship advertisement
- Diversity and inclusion statement
- Culture statement
- Employee value proposition

#### O. Legal, Regulatory and Compliance Content

- Client alert
- Legal update
- Regulatory update
- Legislative update
- Compliance update
- Case-law summary
- Judgment summary
- Legal commentary
- Legal article
- Legal briefing
- Legal newsletter
- Legal FAQ
- Practice-area page
- Legal service page
- Legal guide
- Legal checklist
- Compliance checklist
- Compliance notice
- Regulatory notice
- Policy document
- Procedure document
- Governance document
- Code of conduct
- Terms and conditions
- Privacy notice
- Cookie notice
- Disclaimer
- Consent wording
- Disclosure statement
- Risk warning
- Accessibility statement
- Complaints procedure
- Data-protection notice
- Retention notice
- Acceptable-use policy
- Anti-bribery policy
- Anti-money-laundering policy
- Modern-slavery statement
- Equality policy
- Whistleblowing policy
- Internal compliance communication
- Regulatory response draft
- Consultation response
- Contract summary
- Plain-language legal summary
- Template letter
- Formal notice
- Demand letter
- Cease-and-desist draft
- Engagement-letter content
- Client-care letter
- Matter update
- Legal chronology
- Issues list
- Due-diligence checklist

#### P. Events and Webinars

- Event announcement
- Event invitation
- Event description
- Event landing page
- Event agenda
- Conference programme
- Speaker biography
- Speaker introduction
- Session description
- Panel description
- Moderator questions
- Panel questions
- Event script
- Opening remarks
- Closing remarks
- Master-of-ceremonies script
- Webinar invitation
- Webinar description
- Webinar script
- Webinar follow-up
- Registration confirmation
- Reminder message
- Post-event email
- Attendee survey
- Event recap
- Event press release
- Sponsorship pack
- Exhibitor pack
- Delegate information
- Venue information

#### Q. Printed and Promotional Materials

- Brochure copy
- Corporate brochure
- Product brochure
- Service brochure
- Leaflet
- Flyer
- Poster
- Catalogue copy
- Product catalogue
- Direct-mail letter
- Postcard copy
- Exhibition-panel copy
- Pull-up banner copy
- Signage copy
- Packaging copy
- Product label
- Insert card
- Instruction leaflet
- Promotional merchandise copy
- Business-card tagline
- Folder copy
- Presentation-folder copy
- Print newsletter
- Magazine advertisement
- Newspaper advertisement

#### R. Customer Service and Support

- FAQ section
- FAQ page
- Help-centre article
- Knowledge-base article
- Troubleshooting guide
- User guide
- Setup guide
- Installation guide
- Product instructions
- Support response
- Customer-service response
- Complaint response
- Refund response
- Apology message
- Delay notification
- Service-disruption notice
- Incident update
- Maintenance notification
- Shipping update
- Returns instructions
- Cancellation instructions
- Account-help content
- Chatbot script
- Live-chat script
- Call-centre script
- Interactive voice-response script
- Customer survey
- Satisfaction survey
- Feedback form
- Support macro

#### S. Product and Software Content

- Product description
- Product-page copy
- Product feature description
- Product benefit description
- Product comparison
- Product-release notes
- Product announcement
- Product roadmap summary
- Software documentation
- Technical documentation
- API documentation
- User documentation
- Installation instructions
- Setup instructions
- Configuration guide
- Integration guide
- Migration guide
- Troubleshooting guide
- User-interface copy
- In-app message
- Onboarding screen
- Tooltip copy
- Empty-state copy
- Error message
- Success message
- Notification copy
- Push notification
- App-store description
- Release announcement
- Changelog
- Feature announcement
- Beta invitation
- Product feedback survey

#### T. Messaging and Short-Form Copy

- SMS message
- WhatsApp message
- Direct message
- Push notification
- App notification
- Banner message
- Alert message
- Reminder message
- Confirmation message
- Appointment message
- Booking message
- Cancellation message
- Emergency notification
- Promotional message
- Short announcement
- Call-to-action
- Headline
- Subheading
- Tagline
- Slogan
- Elevator pitch
- Value proposition
- Boilerplate
- Biography
- Short biography
- Company description
- Product summary
- Service summary

### 3. Optimise For

- A separate multi-select field should be used for optimisation methods.

#### A. Search Engine Optimisation

- SEO
- On-page SEO
- Technical SEO guidance
- Local SEO
- International SEO
- Multilingual SEO
- E-commerce SEO
- Enterprise SEO
- News SEO
- Video SEO
- Image SEO
- App-store optimisation
- Marketplace optimisation
- Search-intent optimisation
- Keyword optimisation
- Topic-cluster optimisation
- Semantic SEO
- Entity SEO
- Featured-snippet optimisation
- People-also-ask optimisation
- Zero-click search optimisation
- Voice-search optimisation
- Google Discover optimisation
- Google News optimisation

#### B. Answer Engine Optimisation

- AEO
- Direct-answer optimisation
- Question-based optimisation
- Conversational-query optimisation
- Featured-answer optimisation
- FAQ optimisation
- Voice-answer optimisation
- Extractable-answer formatting
- Definition optimisation
- How-to answer optimisation
- Comparison-answer optimisation
- Troubleshooting-answer optimisation

#### C. Generative Engine Optimisation

- GEO
- Generative-search visibility
- AI citation optimisation
- AI source-selection optimisation
- AI summary optimisation
- AI overview optimisation
- Brand-mention optimisation
- Entity-recognition optimisation
- Factual-consistency optimisation
- Citation-ready content
- Evidence-led content
- Quotable-content optimisation
- Structured-answer optimisation
- Knowledge-graph alignment
- Multi-source corroboration
- Authoritative-source positioning

#### D. Large Language Model Optimisation

- LLMO
- LLM visibility
- LLM retrieval optimisation
- Retrieval-augmented generation optimisation
- Machine-readable content
- Semantic chunk optimisation
- Entity disambiguation
- Context-window optimisation
- Prompt-response compatibility
- Training-data discoverability
- AI-assistant discoverability
- Brand representation in AI responses
- Product representation in AI responses
- Service representation in AI responses

#### E. Trust and Authority Optimisation

- E-E-A-T optimisation
- Author authority
- Organisational authority
- Subject-matter expertise
- Source transparency
- Citation quality
- Evidence quality
- Factual accuracy
- First-party research
- Original insight
- Expert review
- Editorial review
- Date and freshness signals
- Author biography
- Reviewer biography
- Trust signals
- Reputation signals
- Experience signals

#### F. Conversion Optimisation

- Conversion-rate optimisation
- Lead-generation optimisation
- Sales optimisation
- Call-to-action optimisation
- Landing-page optimisation
- Form-completion optimisation
- Booking optimisation
- Demo-request optimisation
- Free-trial optimisation
- Checkout optimisation
- Upsell optimisation
- Cross-sell optimisation
- Retention optimisation
- Engagement optimisation
- Click-through-rate optimisation
- Email-open-rate optimisation
- Email-response optimisation

#### G. Readability and Accessibility

- Plain-language optimisation
- Readability optimisation
- Accessibility optimisation
- Screen-reader compatibility
- Cognitive accessibility
- Inclusive-language review
- Mobile readability
- Scannability
- Short-paragraph formatting
- Heading hierarchy
- Accessible-link wording
- Alternative-text support
- Easy-read format

### 4. Primary Objective

- Brand awareness
- Thought leadership
- Educate
- Inform
- Explain
- Generate leads
- Generate sales
- Generate enquiries
- Encourage bookings
- Encourage downloads
- Encourage registrations
- Promote an event
- Promote a product
- Promote a service
- Launch a product
- Launch a service
- Build authority
- Build trust
- Improve search visibility
- Improve AI-search visibility
- Gain citations
- Answer customer questions
- Reduce support requests
- Improve onboarding
- Retain customers
- Re-engage customers
- Increase referrals
- Recruit employees
- Communicate internally
- Manage reputation
- Respond to criticism
- Manage a crisis
- Announce news
- Explain a change
- Secure approval
- Obtain consent
- Support compliance
- Influence policy
- Encourage participation
- Collect feedback

### 5. Audience

#### A. Audience Type

- General public
- Existing clients
- Prospective clients
- Existing customers
- Prospective customers
- Consumers
- Businesses
- Small businesses
- Medium-sized businesses
- Large enterprises
- Start-ups
- Founders
- Directors
- Executives
- Board members
- Investors
- Shareholders
- Partners
- Suppliers
- Employees
- Managers
- Candidates
- Students
- Researchers
- Journalists
- Regulators
- Government
- Policymakers
- Industry professionals
- Technical professionals
- Legal professionals
- Healthcare professionals
- Educators
- Community groups
- Members
- Donors
- Volunteers

#### B. Audience Awareness Level

- Unaware
- Problem aware
- Solution aware
- Product aware
- Brand aware
- Existing user
- Returning customer
- Expert audience
- Non-expert audience
- Mixed audience

#### C. Decision-Making Role

- Decision-maker
- Influencer
- Recommender
- Budget holder
- Procurement
- Technical evaluator
- End user
- Gatekeeper
- Adviser
- Regulator

### 6. Funnel Stage

- Awareness
- Interest
- Consideration
- Evaluation
- Comparison
- Decision
- Purchase
- Onboarding
- Adoption
- Retention
- Renewal
- Expansion
- Advocacy
- Re-engagement

### 7. Channel or Platform

- Website
- Blog
- Landing page
- Email
- Email newsletter
- LinkedIn
- X
- Facebook
- Instagram
- TikTok
- YouTube
- Pinterest
- Reddit
- WhatsApp
- SMS
- Mobile app
- Web application
- Client portal
- Intranet
- Print
- Press
- Television
- Radio
- Podcast
- Webinar
- Presentation
- Event
- Sales platform
- E-commerce platform
- Marketplace
- App store
- Help centre
- Knowledge base
- Chatbot
- Live chat

### 8. Search and AI Discovery Target

- Google Search
- Bing
- Google AI Overviews
- Bing Copilot
- ChatGPT Search
- ChatGPT
- Microsoft Copilot
- Perplexity
- Claude
- Gemini
- Meta AI
- Grok
- You.com
- Brave Search
- Voice assistants
- Enterprise AI assistants
- Internal knowledge systems
- Retrieval-augmented generation systems

### 9. Search Intent

- Informational
- Navigational
- Commercial investigation
- Transactional
- Local
- Branded
- Non-branded
- Comparative
- Problem-solving
- Definition
- How-to
- Troubleshooting
- Research
- News
- Product
- Service
- Purchase
- Booking
- Download
- Registration

### 10. Query Format

- Keyword
- Long-tail keyword
- Natural-language question
- Conversational query
- Voice-search query
- Comparison query
- Alternatives query
- Best-of query
- Near-me query
- Definition query
- How-to query
- Why query
- When query
- Where query
- Who query
- What query
- Can query
- Should query
- Problem-and-solution query
- Branded query
- Unbranded query

### 11. Tone and Voice

- Professional
- Formal
- Conversational
- Authoritative
- Expert
- Educational
- Informative
- Persuasive
- Reassuring
- Empathetic
- Direct
- Neutral
- Objective
- Friendly
- Approachable
- Confident
- Premium
- Technical
- Academic
- Journalistic
- Legal
- Corporate
- Promotional
- Urgent
- Inspirational
- Humorous
- Plain English
- Brand voice
- Custom voice profile

### 12. Reading Level

- General public
- Plain English
- Easy read
- Secondary school
- Further education
- University
- Professional
- Specialist
- Technical expert
- Academic
- Legal professional

### 13. Content Length

- Microcopy
- Under 50 words
- 50 to 100 words
- 100 to 250 words
- 250 to 500 words
- 500 to 750 words
- 750 to 1,000 words
- 1,000 to 1,500 words
- 1,500 to 2,500 words
- 2,500 to 5,000 words
- More than 5,000 words
- Platform-recommended length
- Custom word count

### 14. Content Structure

- Paragraphs
- Short paragraphs
- Numbered list
- Bullet list
- Table
- Question and answer
- FAQ
- Step-by-step guide
- Problem-solution format
- Before-and-after format
- Comparison format
- Pros-and-cons format
- Case-study format
- News format
- Press-release format
- Report format
- Executive-summary format
- Pyramid structure
- Inverted-pyramid structure
- Storytelling structure
- AIDA
- PAS
- BAB
- FAB
- Four Ps
- Custom outline

### 15. Required Components

- Title
- Alternative titles
- Headline
- Subheading
- Executive summary
- Key takeaways
- Introduction
- Table of contents
- Main body
- Conclusion
- Recommendations
- Call to action
- Frequently asked questions
- Definitions
- Examples
- Case study
- Statistics
- Expert quotation
- Internal links
- External references
- Sources
- Footnotes
- Endnotes
- Author biography
- Reviewer biography
- Publication date
- Last-updated date
- Disclaimer
- Compliance notice
- Contact details
- Metadata
- Social media excerpt

### 16. Evidence and Source Requirements

- No external sources
- User-provided sources only
- First-party sources
- Official sources
- Government sources
- Regulatory sources
- Academic sources
- Peer-reviewed research
- Industry sources
- Reputable media
- Primary sources only
- Secondary sources permitted
- Recent sources only
- Sources within a defined date range
- Minimum source count
- Source citations required
- Direct quotations permitted
- Statistics required
- Case examples required
- Links required
- Footnotes required
- Bibliography required

### 17. SEO Inputs

- Primary keyword
- Secondary keywords
- Related keywords
- Search intent
- Target location
- Target language
- Competitor URLs
- Existing page URL
- Target page URL
- Internal-link targets
- External-link targets
- Meta title
- Meta description
- URL slug
- H1
- H2 headings
- H3 headings
- Image alt text
- Image title
- Schema type
- Canonical-page guidance
- Keyword exclusions
- Brand terms
- Product terms
- Service terms

### 18. AEO Inputs

- Primary question
- Related questions
- Short answer
- Expanded answer
- Definition
- Step-by-step response
- Eligibility criteria
- Requirements
- Costs
- Timeframes
- Benefits
- Risks
- Alternatives
- Comparison points
- Common mistakes
- Exceptions
- Follow-up questions
- FAQ questions
- Voice-search phrasing
- Featured-snippet format

### 19. GEO and LLMO Inputs

- Target AI engines
- Target entity
- Entity description
- Brand facts
- Product facts
- Service facts
- Authoritative claims
- Supporting evidence
- Preferred citations
- Third-party validation
- Key statistics
- Quotable statements
- Unique research
- Expert credentials
- Brand associations
- Competitor distinctions
- Common AI misconceptions
- Required factual corrections
- Structured data recommendations
- Knowledge-graph entities
- Source-attribution requirements
- Citation-ready passages
- Machine-readable summaries

### 20. Metadata and Schema Output

- Meta title
- Meta description
- URL slug
- Open Graph title
- Open Graph description
- X card title
- X card description
- Article schema
- BlogPosting schema
- NewsArticle schema
- FAQPage schema
- HowTo schema
- Product schema
- Service schema
- Organisation schema
- LocalBusiness schema
- Person schema
- Event schema
- VideoObject schema
- Review schema
- AggregateRating schema
- BreadcrumbList schema
- WebPage schema
- ProfilePage schema
- Dataset schema
- SoftwareApplication schema
- JobPosting schema
- JSON-LD output

### 21. Localisation

- Country
- Region
- City
- Language
- Language variant
- Currency
- Date format
- Time format
- Units of measurement
- Local terminology
- Local spelling
- Local legal requirements
- Local regulatory requirements
- Local cultural references
- Local search terms
- Local contact details
- Translation required
- Transcreation required

### 22. Brand Controls

- Brand name
- Brand description
- Brand voice
- Brand values
- Brand positioning
- Brand promise
- Key messages
- Approved terminology
- Prohibited terminology
- Preferred spelling
- Product names
- Service names
- Competitor references
- Claims restrictions
- Trademark formatting
- Boilerplate
- Approved calls to action
- Style guide
- Example content
- Words to avoid

### 23. Compliance Controls

- Legal review required
- Compliance review required
- Regulatory review required
- Medical review required
- Financial review required
- Human review required
- Factual verification required
- Source verification required
- Claim substantiation required
- Copyright review required
- Trademark review required
- Privacy review required
- Data-protection review required
- Accessibility review required
- Bias review required
- Defamation review required
- Confidentiality review required
- Client-conflict review required
- Jurisdiction check required
- Disclaimer required
- Risk warning required
- Approval workflow required

### 24. Restricted Content Controls

- No unsupported claims
- No invented statistics
- No invented quotations
- No fabricated case studies
- No fabricated citations
- No competitor disparagement
- No legal advice
- No medical advice
- No financial advice
- No guarantees
- No superlative claims
- No confidential information
- No personal data
- No politically sensitive content
- No regulated-product promotion
- No discriminatory language
- No manipulative language
- No fear-based claims
- No unverifiable testimonials

### 25. Output Options

- Single draft
- Multiple draft options
- Short and long versions
- Formal and conversational versions
- Channel-specific versions
- Platform-specific versions
- SEO version
- AEO version
- GEO version
- Plain-English version
- Executive version
- Technical version
- Social-media excerpts
- Email excerpt
- Metadata
- Schema markup
- Content brief
- Outline only
- Full draft
- Draft with notes
- Draft with citations
- Draft with tracked recommendations
- Draft with compliance flags
- Draft with fact-check flags
- Editable template
- Copy-ready output

### 26. Review Checks

- Grammar
- Spelling
- Punctuation
- Readability
- Tone consistency
- Brand consistency
- Factual accuracy
- Citation accuracy
- Claim substantiation
- SEO coverage
- AEO coverage
- GEO coverage
- Keyword usage
- Entity coverage
- Content originality
- Duplication
- Accessibility
- Inclusive language
- Legal risk
- Regulatory risk
- Privacy risk
- Reputational risk
- Defamation risk
- Copyright risk
- Call-to-action clarity
- Conversion potential
- Platform compliance

### 27. Recommended UI Hierarchy

The interface should not place every option in one dropdown. Use the following hierarchy:

Create for

Content category

Content type

Channel or platform

Primary objective

Audience

Funnel stage

Optimise for

Search or AI discovery target

Tone and voice

Length and structure

Evidence and sources

Brand controls

Compliance controls

Output options

AEO, GEO, LLMO, SEO and conversion optimisation belong under Optimise for, not under Content type.

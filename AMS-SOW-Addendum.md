# Statement of Work (SOW)
## Application Management Services Engagement
### Bio-Rad Laboratories, Inc.

**SOW Number:** [Insert SOW Number]  
**Effective Date:** [Insert Date]  
**Client:** Bio-Rad Laboratories, Inc.  
**Service Provider:** Diverse Programmers  

---

## 1. Governing Documents and Precedence

This Statement of Work ("SOW") is entered into pursuant to and governed by the Professional Services Master Agreement ("PSMA") executed between Bio-Rad Laboratories, Inc. ("Client") and Diverse Programmers ("Service Provider") dated [Insert PSMA Date].

**Order of Precedence:** In the event of any conflict or inconsistency between the documents comprising this engagement, the following order of precedence shall apply:
1. This Statement of Work (SOW)
2. Professional Services Master Agreement (PSMA)
3. Application Management Services Service Definition Document v1.0 ("AMS Service Definition"), incorporated herein by reference
4. Exhibit A: In-Scope Applications
5. Exhibit B: Service Units & Commercials

---

## 2. Term and Termination Provisions

### 2.1 Initial Term and Renewal

**Initial Term:** This SOW shall commence on [Insert Start Date] and continue for an initial term of thirty-six (36) months ("Initial Term"), unless earlier terminated in accordance with the provisions herein.

**Renewal Options:** Upon expiration of the Initial Term, this SOW shall automatically renew for successive twelve (12) month periods ("Renewal Terms") unless either party provides written notice of non-renewal at least ninety (90) days prior to the end of the then-current term.

### 2.2 Termination Rights

**Termination for Convenience:** Either party may terminate this SOW for convenience by providing the other party with one hundred eighty (180) days advance written notice. Client shall compensate Service Provider for all services performed and committed expenses incurred through the effective termination date, including any non-cancellable commitments made by Service Provider on Client's behalf.

**Termination for Cause:** Either party may terminate this SOW immediately upon written notice if:
- The other party materially breaches this SOW or the PSMA and fails to cure such breach within thirty (30) days after receiving written notice specifying the breach
- The other party becomes insolvent, files for bankruptcy, or makes an assignment for the benefit of creditors
- The other party ceases normal business operations or becomes subject to any bankruptcy, reorganization, or insolvency proceeding

**Termination for Persistent SLA Failures:** Client may terminate this SOW for cause upon thirty (30) days written notice if:
- Service Provider fails to meet Priority 1 (P1) SLA targets in three (3) consecutive calendar months, despite receiving service credits
- Service Provider accumulates the maximum service credit cap (as defined in the AMS Service Definition) in any two (2) quarters within a rolling twelve (12) month period

### 2.3 Exit Management and Transition Services

Upon termination or expiration of this SOW for any reason, Service Provider shall provide Exit Management Services for a period of up to ninety (90) days ("Exit Period") to facilitate orderly transition of services.

**Exit Management Services include:**

**Knowledge Transfer and Documentation:**
- Provide complete, current copies of all runbooks, operational procedures, configuration documentation, and troubleshooting guides
- Conduct structured knowledge transfer sessions with Client's designated personnel or replacement service provider (minimum 40 hours)
- Transfer all operational artifacts, incident histories, change logs, and performance reports
- Provide access to all monitoring dashboards, alerting configurations, and automation scripts

**Data and Asset Return:**
- Return all Client data, credentials, access tokens, and proprietary information in industry-standard, usable formats within fifteen (15) days of termination notice
- Securely destroy all copies of Client confidential information within thirty (30) days of Exit Period completion, with written certification
- Transfer ownership and source code for any custom scripts, automation tools, or enhancements developed specifically for Client's applications (subject to IP provisions in Section 3)

**Transition Assistance:**
- Provide reasonable cooperation to Client or replacement service provider during transition, including participating in transition planning meetings
- Maintain service continuity and meet all SLA requirements throughout the Exit Period
- Execute orderly handoff of active incidents, change requests, and in-flight projects
- Provide access credentials, vendor relationships, and third-party contact information

**Exit Fees:** Client shall compensate Service Provider for Exit Management Services at the then-current Service Unit rate or on a time-and-materials basis as mutually agreed. If termination is by Client for cause due to Service Provider's material breach, Exit Management Services shall be provided at no additional charge beyond the monthly recurring fees through the Exit Period.

**Exit Plan:** Within fifteen (15) days of receiving termination notice, Service Provider shall deliver a detailed Exit Plan to Client for review and approval, outlining the specific activities, timelines, deliverables, and responsibilities for both parties during the Exit Period.

---

## 3. Intellectual Property Ownership and Rights

### 3.1 Client Pre-Existing IP

Client retains all ownership rights, title, and interest in and to:
- All Client applications, data, systems, and technology existing prior to or developed independently of this SOW
- All Client business processes, methodologies, confidential information, and trade secrets
- All Client trademarks, branding, and proprietary information

### 3.2 Service Provider Pre-Existing IP

Service Provider retains all ownership rights, title, and interest in and to:
- Service Provider's proprietary tools, frameworks, methodologies, processes, and templates existing prior to or developed independently of this engagement ("Background IP")
- Service Provider's proprietary software platforms, monitoring tools, automation frameworks, and utilities
- Any generic, reusable components, libraries, or code modules that are not specific to Client's environment

### 3.3 Work Product and Foreground IP

**Definition:** "Work Product" means all materials, deliverables, custom scripts, configurations, documentation, enhancements, modifications, and other intellectual property created by Service Provider specifically for Client's applications during the performance of services under this SOW ("Foreground IP").

**Ownership:**
- **Custom Application-Specific Development:** All Work Product that is bespoke, application-specific, or developed exclusively for Client's business requirements shall be owned by Client upon full payment of applicable fees. This includes:
  - Custom scripts written specifically for Client's applications
  - Application-specific automation workflows and integrations
  - Custom dashboards, reports, or monitoring configurations unique to Client's environment
  - Documentation, runbooks, and procedures specific to Client's applications

- **Service Provider Retained IP:** Service Provider retains ownership of:
  - Generic methodologies, frameworks, and approaches used to deliver services
  - Reusable templates, tools, and utilities that can be applied across multiple clients
  - Derivative improvements to Service Provider's Background IP
  - Process documentation and operational knowledge gained that does not contain Client confidential information

**License to Client:** For any Work Product retained by Service Provider, Service Provider grants Client a perpetual, irrevocable, worldwide, royalty-free, non-exclusive license to use, modify, reproduce, and create derivative works of such Work Product solely for Client's internal business purposes.

**License to Service Provider:** Client grants Service Provider a non-exclusive, non-transferable license to use Client's Background IP solely to the extent necessary to perform services under this SOW during the term hereof.

### 3.4 Third-Party IP

Neither party makes any warranties or representations regarding third-party software, tools, or platforms. Each party shall be responsible for obtaining and maintaining licenses for any third-party software or tools it uses in performing its obligations under this SOW.

### 3.5 Deliverables and Source Code

Upon termination or expiration of this SOW and Client's payment of all outstanding fees:
- Service Provider shall deliver to Client all source code, documentation, and materials constituting Work Product owned by Client
- Service Provider shall provide Client with reasonable assistance (up to 20 hours at no additional charge) to implement or understand transferred Work Product
- Client acknowledges that certain operational tools may be Service Provider's proprietary Background IP and will be provided under license terms as described in Section 3.3

---

## 4. Change Control and Change Management Process

### 4.1 Change Categories

All changes to in-scope applications shall be categorized and managed according to the following framework:

**Standard Changes:**
- Pre-approved, low-risk changes following documented procedures (e.g., routine patching, certificate renewals)
- No formal Change Advisory Board (CAB) approval required
- Tracked in monthly operational reporting

**Minor Enhancements:**
- Changes requiring less than eight (8) Service Units or eight (8) hours of effort
- Covered under the standard AMS engagement and Service Unit consumption model
- Require Client approval via Change Request process (Section 4.2)

**Major Enhancements:**
- Changes requiring eight (8) or more Service Units or exceeding eight (8) hours of effort
- Require separate Statement of Work or Change Order with defined scope, timeline, and pricing
- Managed outside of the standard Service Unit model

**Emergency Changes:**
- Critical changes required to restore service or mitigate immediate security threats
- May be implemented with expedited approval process
- Must be documented and reviewed retrospectively within 48 business hours

### 4.2 Change Request Process

**Step 1: Change Request Submission**
- Client or Service Provider may initiate a Change Request using the standard Change Request Form (Appendix A)
- Change Request must include: description, business justification, estimated effort, impact assessment, proposed timeline, and rollback plan

**Step 2: Initial Assessment**
- Service Provider shall assess the Change Request within three (3) business days and provide:
  - Estimated effort in Service Units or hours
  - Risk assessment (Low/Medium/High)
  - Recommended implementation approach
  - Dependencies and prerequisites
  - Change category classification

**Step 3: Client Review and Approval**
- For Minor Enhancements (< 8 SU): Client's designated Application Owner may approve
- For Major Enhancements (≥ 8 SU): Client's IT Leadership or designated Change Authority must approve and authorize separate SOW/Change Order
- Approval authority thresholds are defined in Section 3.3 of the AMS Service Definition Document

**Step 4: Change Planning and Scheduling**
- Upon approval, Service Provider develops detailed implementation plan including:
  - Detailed work breakdown
  - Resource assignments
  - Testing requirements
  - Change window scheduling
  - Rollback procedures

**Step 5: Implementation and Verification**
- Service Provider implements change in accordance with approved plan
- Client conducts User Acceptance Testing (UAT) as required
- Service Provider documents change completion and obtains Client sign-off

**Step 6: Post-Implementation Review**
- For High-risk or Major Enhancement changes, parties shall conduct post-implementation review within seven (7) days
- Lessons learned documented and incorporated into future change planning

### 4.3 Change Authority and Thresholds

| Change Type | Approval Authority | Approval Timeline |
|-------------|-------------------|-------------------|
| Standard Changes | Service Provider (pre-approved) | N/A - Pre-authorized |
| Minor Enhancements (< 8 SU) | Client Application Owner | 3 business days |
| Major Enhancements (≥ 8 SU) | Client IT Leadership + Separate SOW | 10 business days |
| Emergency Changes | Client Emergency Contact + Retrospective Documentation | Immediate (verbal approval acceptable) |

### 4.4 Service Unit Consumption Tracking

- All Minor Enhancements consume Service Units from Client's monthly or banked allocation per the commercials defined in Exhibit B
- Service Provider shall provide real-time Service Unit consumption tracking via shared dashboard
- Monthly reports shall include: SU consumed, SU remaining, SU rollover (if applicable), and projected consumption trends
- Client shall receive notification when SU consumption reaches 70% and 90% of available allocation

### 4.5 Change Freeze Periods

Client may designate Change Freeze Periods (e.g., fiscal year-end, critical business periods) during which only Emergency Changes are permitted. Client shall provide Service Provider with at least thirty (30) days advance notice of planned Change Freeze Periods.

---

## 5. Transition and Knowledge Transfer Requirements

### 5.1 Onboarding and Transition-In

**Transition Timeline:** Service Provider shall complete transition and onboarding activities within sixty (60) days of SOW Effective Date ("Transition Period"), subject to Client's timely provision of required access, documentation, and cooperation.

**Transition Activities:**

**Phase 1: Discovery and Planning (Days 1-15)**
- Kick-off meeting with key stakeholders
- Review existing documentation, runbooks, and operational procedures
- Identify gaps in documentation and knowledge
- Assess current application health, technical debt, and known issues
- Develop detailed Transition Plan with milestones and success criteria

**Phase 2: Knowledge Transfer (Days 16-40)**
- Conduct structured knowledge transfer sessions with Client's IT team or incumbent service provider (minimum 60 hours)
- Document application architecture, integrations, dependencies, and configurations
- Transfer credentials, access rights, and security protocols
- Review incident history, recurring issues, and troubleshooting procedures
- Shadow Client's team or incumbent provider on live incidents and changes

**Phase 3: Operational Readiness (Days 41-60)**
- Configure monitoring, alerting, and reporting tools
- Establish communication channels, escalation contacts, and governance mechanisms
- Conduct Operational Readiness Review (ORR) with Client stakeholders
- Perform dry-run incident response and change execution exercises
- Obtain Client sign-off on Operational Readiness Checklist

**Acceptance Criteria:** Transition shall be deemed complete upon Client's written acceptance of the Operational Readiness Review, confirming Service Provider's readiness to assume full operational responsibility for in-scope applications.

**Transition Fees:** Transition and onboarding activities are included in the Year 1 pricing as specified in Exhibit B: Service Units & Commercials. No additional fees apply unless Client requests scope expansion beyond initial in-scope applications defined in Exhibit A.

### 5.2 Knowledge Management and Documentation

**Ongoing Documentation Requirements:**
- Service Provider shall maintain current, accurate runbooks and operational procedures for all in-scope applications
- All runbooks shall be stored in Client's designated knowledge management system or shared repository
- Service Provider shall update documentation within five (5) business days of any significant application change, configuration modification, or process improvement
- Quarterly documentation reviews shall be conducted to ensure accuracy and completeness

**Documentation Standards:**
All documentation shall include:
- Application overview and business purpose
- Technical architecture and integration points
- Step-by-step operational procedures for routine tasks
- Incident troubleshooting guides and known issue resolutions
- Change implementation procedures and rollback plans
- Access credentials, vendor contacts, and escalation paths (secured appropriately)

### 5.3 Knowledge Sharing and Training

Service Provider shall:
- Conduct quarterly knowledge-sharing sessions with Client's IT team on application health, improvements, and best practices
- Provide on-demand training to Client personnel on operational procedures upon reasonable request (up to 16 hours per year included; additional training at prevailing hourly rates)
- Facilitate "lessons learned" sessions following major incidents or significant changes

---

## 6. Dispute Resolution Process

### 6.1 Escalation Path

The parties shall attempt to resolve any disputes arising under this SOW through the following escalation process before pursuing formal dispute resolution:

**Level 1: Operational Management (Days 1-5)**
- Initial dispute raised to Service Provider's Engagement Manager and Client's Application Owner
- Informal discussion and collaborative problem-solving

**Level 2: Senior Management (Days 6-10)**
- Escalation to Service Provider's Director of Managed Services and Client's IT Manager/Director
- Formal meeting to review facts, positions, and proposed resolutions

**Level 3: Executive Leadership (Days 11-15)**
- Escalation to Service Provider's VP of Operations and Client's CIO or VP of IT
- Executive-level negotiation and decision-making

### 6.2 Formal Dispute Resolution

If the dispute remains unresolved after the escalation process, the parties shall proceed with the dispute resolution procedures set forth in the PSMA, which shall govern all formal dispute resolution mechanisms including mediation, arbitration, or litigation as specified therein.

### 6.3 Service Continuity During Disputes

Unless otherwise directed by Client or required by law, Service Provider shall continue performing services in accordance with this SOW during any dispute resolution process. Client shall continue to pay undisputed fees and Service Unit charges during the dispute resolution period.

---

## 7. Service Levels, Penalties, and Performance Management

### 7.1 Service Level Commitments

Service Level Agreements (SLAs) for incident response, restoration, and reporting are defined in Section 5 of the AMS Service Definition Document, incorporated herein by reference. Key SLA commitments include:

| Priority | Response Target | Restoration Target | Business Impact |
|----------|----------------|-------------------|-----------------|
| P1 - Critical | 30 minutes | 4 hours | Complete application outage affecting business operations |
| P2 - High | 2 hours | 8 hours | Significant degradation affecting multiple users |
| P3 - Medium | 4 hours | 24 hours | Limited functionality impairment |
| P4 - Low | 8 hours | 5 business days | Minimal impact or cosmetic issues |

**SLA Measurement Period:** Monthly, calculated based on business hours (Monday-Friday, 8:00 AM - 6:00 PM Client local time, excluding Client-recognized holidays) unless 24x7 support is explicitly included for specific applications.

**SLA Exclusions:** SLA targets shall not apply during planned maintenance windows, Change Freeze Periods, force majeure events, or when caused by Client actions, third-party systems outside Service Provider's control, or factors specified in Section 5.3 of the AMS Service Definition.

### 7.2 Service Credits and Penalty Structure

**Service Credit Calculation:**
Service Provider shall issue service credits to Client for verified SLA failures as follows:

**Response Time SLA Failures:**
- 1-10% of incidents miss target: 2% service credit on monthly base fee
- 11-20% of incidents miss target: 5% service credit on monthly base fee
- >20% of incidents miss target: 10% service credit on monthly base fee

**Restoration Time SLA Failures:**
- 1-5% of P1/P2 incidents miss target: 3% service credit on monthly base fee
- 6-10% of P1/P2 incidents miss target: 7% service credit on monthly base fee
- >10% of P1/P2 incidents miss target: 15% service credit on monthly base fee

**Service Credit Caps:**
- Maximum service credits per month: 20% of monthly base service fee
- Maximum service credits per calendar quarter: 30% of quarterly base service fees
- Service credits are Client's sole and exclusive remedy for SLA failures, except for termination rights specified in Section 2.2

**Service Credit Redemption:**
- Service credits shall be applied to the following month's invoice automatically
- Service credits do not apply to Service Unit consumption charges, only to base monthly recurring service fees
- Service credits are non-cumulative and expire if not applied within 90 days

### 7.3 Performance Incentives

**Excellence Bonus (Optional):**
If Service Provider achieves the following performance targets for three (3) consecutive calendar months, Client may, at its sole discretion, provide a performance bonus:
- Zero (0) P1 SLA failures
- <2% P2 SLA failures
- Customer Satisfaction Score (CSAT) ≥ 4.5 out of 5.0 on quarterly surveys

Performance bonus, if awarded, shall be mutually agreed upon and shall not exceed 5% of the quarterly base service fees.

---

## 8. Additional Legal and Commercial Provisions

### 8.1 Insurance Requirements

Service Provider represents and warrants that it maintains the following insurance coverage throughout the term of this SOW:

- **Professional Liability (Errors & Omissions):** Minimum $2,000,000 per occurrence and aggregate
- **General Commercial Liability:** Minimum $1,000,000 per occurrence and $2,000,000 aggregate
- **Cyber Liability Insurance:** Minimum $2,000,000 per occurrence, covering data breaches and security incidents
- **Workers' Compensation:** As required by applicable law

Service Provider shall provide Client with certificates of insurance evidencing such coverage upon request and shall provide thirty (30) days advance written notice of any cancellation or material reduction in coverage.

### 8.2 Confidentiality and Data Protection

All confidentiality obligations are governed by the PSMA. Without limiting the PSMA, the parties acknowledge:

- Service Provider shall treat all Client data, application configurations, business processes, and operational information as Client Confidential Information
- Service Provider shall implement and maintain administrative, physical, and technical safeguards consistent with industry standards to protect Client Confidential Information
- Confidentiality obligations shall survive termination of this SOW indefinitely for trade secrets and for five (5) years for other Confidential Information

### 8.3 Security and Compliance

**Security Standards:**
Service Provider shall comply with Client's information security policies and standards as provided by Client and incorporated into operational runbooks. Service Provider shall:
- Conduct background checks on personnel with access to Client systems
- Implement multi-factor authentication for all administrative access
- Encrypt data in transit and at rest using industry-standard protocols
- Report security incidents to Client within four (4) hours of discovery

**Compliance Alignment:**
Service Provider shall align operational practices with Client's compliance requirements (e.g., SOX, HIPAA, GDPR) as applicable to in-scope applications. Additional compliance-specific work beyond standard operational alignment shall be billed separately on a time-and-materials basis.

### 8.4 Independent Contractor Relationship

Service Provider is an independent contractor and not an employee, agent, partner, or joint venturer of Client. Service Provider shall have sole responsibility for all employment-related obligations for its personnel, including compensation, benefits, taxes, and compliance with employment laws.

### 8.5 Subcontractors

Service Provider may engage subcontractors to perform services under this SOW only with Client's prior written consent. Service Provider remains fully responsible for all acts and omissions of its subcontractors. Service Provider shall ensure all subcontractors are bound by confidentiality and data protection obligations no less protective than those in this SOW and the PSMA.

### 8.6 Force Majeure

Neither party shall be liable for failure to perform its obligations (excluding payment obligations) to the extent such failure is caused by events beyond its reasonable control, including acts of God, war, terrorism, civil unrest, natural disasters, labor disputes, pandemics, or governmental actions ("Force Majeure Event"). 

The affected party shall:
- Notify the other party within forty-eight (48) hours of the Force Majeure Event
- Use commercially reasonable efforts to mitigate the impact and resume performance
- Provide regular status updates

If a Force Majeure Event continues for more than thirty (30) consecutive days, either party may terminate this SOW upon written notice without penalty.

### 8.7 Limitation of Liability

Except as otherwise provided in the PSMA, neither party's total cumulative liability arising out of or related to this SOW shall exceed the total fees paid or payable to Service Provider under this SOW in the twelve (12) month period immediately preceding the event giving rise to liability.

**Exclusions from Limitation:**
The limitation of liability shall not apply to:
- Either party's breach of confidentiality obligations
- Either party's gross negligence or willful misconduct
- Service Provider's breach of data protection or security obligations
- Either party's indemnification obligations as set forth in the PSMA
- Amounts owed for unpaid services

### 8.8 Survival

The following provisions shall survive expiration or termination of this SOW: Sections 2.3 (Exit Management), 3 (Intellectual Property), 6 (Dispute Resolution), 8.2 (Confidentiality), 8.7 (Limitation of Liability), 8.8 (Survival), and any other provisions which by their nature are intended to survive.

---

## 9. Notices and Communication

### 9.1 Notice Procedures

All formal notices required under this SOW shall be in writing and delivered via:
- Email with read receipt to the designated notice contacts below, AND
- Certified mail, return receipt requested, to the addresses below

**Client Notice Contact:**
Name: [Insert Name]
Title: [Insert Title]
Email: [Insert Email]
Address: [Insert Address]

**Service Provider Notice Contact:**
Name: [Insert Name]
Title: [Insert Title]
Email: [Insert Email]
Address: [Insert Address]

### 9.2 Operational Communications

Day-to-day operational communications shall be conducted through:
- Incident Management System: [Insert System]
- Change Management Platform: [Insert Platform]
- Email distribution lists: [Insert DLs]
- Bi-weekly governance calls: [Insert Schedule]
- Monthly business review meetings: [Insert Schedule]

---

## 10. Governance and Reporting

### 10.1 Governance Structure

**Bi-Weekly Operational Calls:**
- Review open incidents, changes, and service requests
- Discuss operational issues, risks, and escalations
- Attendees: Service Provider Engagement Manager, Client Application Owner(s)

**Monthly Business Reviews:**
- Review SLA performance, service credits, and KPIs
- Discuss Service Unit consumption, budget forecasting, and upcoming changes
- Review customer satisfaction, incidents trends, and continuous improvement initiatives
- Attendees: Service Provider Account Manager, Client IT Manager, Application Owner(s)

**Quarterly Strategic Reviews:**
- Application health assessment and technical debt review
- Roadmap planning, capacity planning, and strategic initiatives
- Contract performance evaluation and relationship health
- Attendees: Service Provider VP/Director, Client CIO/Director, IT Manager

### 10.2 Reporting Requirements

**Monthly Operational Report (due by 5th business day of following month):**
- SLA performance summary with response/restoration metrics by priority
- Incident volume, trends, and root cause categories
- Change Request summary (submitted, approved, completed)
- Service Unit consumption and remaining allocation
- Service credits issued (if applicable)
- Key accomplishments and upcoming activities

**Quarterly Performance Report (due by 10th business day of following quarter):**
- Quarterly SLA summary and trend analysis
- Application health scorecard and risk assessment
- Security incident summary and compliance status
- Customer satisfaction survey results
- Continuous improvement initiatives and business value delivered

---

## 11. Amendments and Modifications

No amendment, modification, or waiver of any provision of this SOW shall be effective unless in writing and signed by authorized representatives of both parties. Any change to the in-scope applications (Exhibit A) or commercial terms (Exhibit B) shall require a formal amendment or addendum to this SOW.

---

## 12. Signatures

By signing below, the authorized representatives of each party acknowledge that they have read, understood, and agree to be bound by the terms and conditions of this Statement of Work, the incorporated AMS Service Definition Document, and the governing Professional Services Master Agreement.

**CLIENT: Bio-Rad Laboratories, Inc.**

Signature: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_  
Printed Name: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_  
Title: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_  
Date: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_  

**SERVICE PROVIDER: Diverse Programmers**

Signature: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_  
Printed Name: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_  
Title: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_  
Date: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_  

---

## Appendix A: Change Request Form Template

**Change Request Form**

| Field | Details |
|-------|---------|
| **CR Number** | [Auto-generated] |
| **Submitted By** | [Name, Title, Date] |
| **Application** | [Application Name from Exhibit A] |
| **Change Category** | ☐ Standard ☐ Minor Enhancement ☐ Major Enhancement ☐ Emergency |
| **Priority** | ☐ Low ☐ Medium ☐ High ☐ Critical |
| **Change Description** | [Detailed description of requested change] |
| **Business Justification** | [Why is this change needed? What business value does it provide?] |
| **Estimated Effort** | [Service Units or Hours] |
| **Proposed Implementation Date** | [Date or Date Range] |
| **Impact Assessment** | [Which systems, users, or processes are affected?] |
| **Risk Level** | ☐ Low ☐ Medium ☐ High |
| **Rollback Plan** | [How will change be reversed if issues occur?] |
| **Testing Requirements** | [What testing is required before production deployment?] |
| **Approvals Required** | ☐ Application Owner ☐ IT Leadership ☐ Security ☐ Compliance |

**Service Provider Assessment:**

| Field | Details |
|-------|---------|
| **Assessed By** | [Name, Date] |
| **Estimated Effort** | [X Service Units or X Hours] |
| **Dependencies** | [Prerequisites, third-party dependencies] |
| **Recommended Approach** | [Technical implementation approach] |
| **Risks and Mitigation** | [Identified risks and how to mitigate] |
| **Proposed Timeline** | [Planning, implementation, testing, deployment dates] |

**Approvals:**

| Approver | Name & Title | Signature | Date |
|----------|--------------|-----------|------|
| **Application Owner** | | | |
| **IT Leadership** (if Major) | | | |

---

## Appendix B: Operational Readiness Review (ORR) Checklist

**Operational Readiness Review Checklist**

**Engagement:** Bio-Rad Application Management Services  
**Review Date:** [Date]  
**Participants:** [Names and Titles]

| # | Readiness Criteria | Status | Notes |
|---|-------------------|--------|-------|
| **1. Documentation** | | | |
| 1.1 | Complete runbooks for all in-scope applications | ☐ Complete ☐ In Progress | |
| 1.2 | Architecture diagrams and integration maps | ☐ Complete ☐ In Progress | |
| 1.3 | Incident troubleshooting guides | ☐ Complete ☐ In Progress | |
| 1.4 | Change implementation procedures | ☐ Complete ☐ In Progress | |
| **2. Access and Credentials** | | | |
| 2.1 | Production system access provisioned | ☐ Complete ☐ In Progress | |
| 2.2 | Monitoring and logging system access | ☐ Complete ☐ In Progress | |
| 2.3 | Credential vault configured and secured | ☐ Complete ☐ In Progress | |
| 2.4 | Vendor/third-party contact information transferred | ☐ Complete ☐ In Progress | |
| **3. Tooling and Infrastructure** | | | |
| 3.1 | Monitoring and alerting configured | ☐ Complete ☐ In Progress | |
| 3.2 | Incident management system integrated | ☐ Complete ☐ In Progress | |
| 3.3 | Change management platform configured | ☐ Complete ☐ In Progress | |
| 3.4 | Reporting dashboards operational | ☐ Complete ☐ In Progress | |
| **4. Knowledge Transfer** | | | |
| 4.1 | KT sessions completed (minimum 60 hours) | ☐ Complete ☐ In Progress | |
| 4.2 | Shadowing of live incidents completed | ☐ Complete ☐ In Progress | |
| 4.3 | Historical incident review conducted | ☐ Complete ☐ In Progress | |
| 4.4 | Q&A and clarification sessions held | ☐ Complete ☐ In Progress | |
| **5. Team and Communication** | | | |
| 5.1 | Service Provider team members identified | ☐ Complete ☐ In Progress | |
| 5.2 | Escalation paths and contacts documented | ☐ Complete ☐ In Progress | |
| 5.3 | Communication channels established | ☐ Complete ☐ In Progress | |
| 5.4 | Governance meeting schedules confirmed | ☐ Complete ☐ In Progress | |
| **6. Operational Testing** | | | |
| 6.1 | Dry-run incident response exercise completed | ☐ Complete ☐ In Progress | |
| 6.2 | Test change execution performed | ☐ Complete ☐ In Progress | |
| 6.3 | Monitoring alert validation completed | ☐ Complete ☐ In Progress | |
| 6.4 | Backup and recovery procedures tested | ☐ Complete ☐ In Progress | |

**Overall Readiness Assessment:**

☐ **PASS** - Service Provider is ready to assume full operational responsibility  
☐ **PASS WITH MINOR ITEMS** - Ready with minor items to be completed within 10 days  
☐ **NOT READY** - Significant gaps remain; revised ORR date required

**Client Acceptance:**

Signature: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_  
Printed Name: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_  
Title: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_  
Date: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

**END OF STATEMENT OF WORK**
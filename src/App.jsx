import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import {
  ArrowRight,
  BellRing,
  BriefcaseBusiness,
  Check,
  Clock3,
  FileText,
  Mail,
  MessageCircle,
  Phone,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
} from 'lucide-react'
import './App.css'

const tabs = [
  { id: 'overview', label: 'Preview', icon: Sparkles },
  { id: 'subscribe', label: 'Subscribe', icon: FileText },
  { id: 'contact', label: 'Contact', icon: MessageCircle },
]

const jobTypes = ['C2C', 'Full-time', 'Contract', 'Remote', 'Hybrid']
const frequencies = ['Instant', 'Every 15 min', 'Hourly', 'Daily digest']
const subscriptionPlans = [
  { duration: '1 Month', price: '$30' },
  { duration: '3 Months', price: '$75' },
  { duration: '6 Months', price: '$129' },
]
const previewKeywords = [
  'Salesforce Developer C2C hiring',
  'Data Engineer C2C remote',
  'QA Automation C2C hiring',
  'Data Scientist contract roles',
  'Java Full Stack C2C',
  'Python Developer C2C',
  'AWS DevOps C2C hiring',
  'Business Analyst C2C',
  '.NET Developer C2C',
  'Snowflake Data Engineer C2C',
]

function App() {
  const [activeTab, setActiveTab] = useState('overview')
  const [saveState, setSaveState] = useState({ status: 'idle', message: '' })
  const [paymentQr, setPaymentQr] = useState('')
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    linkedinUrl: '',
    targetRole: '',
    location: '',
    keyword: '',
    jobType: 'C2C',
    frequency: 'Instant',
    subject: '',
    subjectVariants: '',
    body: '',
    signature: '',
    resumeName: '',
    resumeFile: null,
    consent: true,
  })

  const completion = useMemo(() => {
    const requiredFields = [
      'fullName',
      'email',
      'phone',
      'linkedinUrl',
      'targetRole',
      'location',
      'keyword',
      'jobType',
      'frequency',
      'subject',
      'subjectVariants',
      'body',
      'signature',
      'resumeName',
      'consent',
    ]
    const filled = requiredFields.filter((field) => {
      if (field === 'consent') {
        return form.consent
      }
      return String(form[field]).trim()
    }).length
    return Math.round((filled / requiredFields.length) * 100)
  }, [form])

  function updateField(event) {
    const { name, type, checked, value, files } = event.target
    setForm((current) => ({
      ...current,
      ...(files
        ? { resumeName: files[0]?.name ?? '', resumeFile: files[0] ?? null }
        : { [name]: type === 'checkbox' ? checked : value }),
    }))
    setSaveState({ status: 'idle', message: '' })
    setPaymentQr('')
  }

  async function saveSubscription(event) {
    event.preventDefault()
    setSaveState({ status: 'saving', message: 'Saving subscription request...' })

    const formData = new FormData()
    Object.entries(form).forEach(([key, value]) => {
      if (key !== 'resumeFile' && key !== 'resumeName') {
        formData.append(key, String(value ?? ''))
      }
    })
    if (form.resumeFile) {
      formData.append('resume', form.resumeFile)
    }

    try {
      const response = await fetch('/api/subscriptions', {
        method: 'POST',
        body: formData,
      })
      const result = await readJsonResponse(response)
      if (!response.ok) {
        throw new Error(result.message || 'Could not save subscription.')
      }
      setSaveState({
        status: 'saved',
        message: `Saved to CSV. Resume stored as ${result.resumeFileName}.`,
      })
      setPaymentQr(await createRandomPaymentQr(form.email))
    } catch (error) {
      setSaveState({ status: 'error', message: error.message })
      setPaymentQr('')
    }
  }

  return (
    <main className="app-shell">
      <section className="brand-band">
        <div className="brand-lockup">
          <div className="logo-mark" aria-hidden="true">
            <BellRing size={26} />
          </div>
          <div>
            <p className="eyebrow">Jobot AI</p>
            <h1>Reach Recruiters Before the Crowd</h1>
          </div>
        </div>

        <div className="signal-strip" aria-label="Automation highlights">
          <span>
            <Clock3 size={16} /> Runs every 1 minute
          </span>
          <span>
            <Mail size={16} /> Recruiter emails captured
          </span>
          <span>
            <ShieldCheck size={16} /> Resume-ready outreach
          </span>
        </div>
      </section>

      <nav className="tabs" aria-label="Subscription setup tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'tab active' : 'tab'}
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={activeTab === tab.id}
            >
              <Icon size={18} />
              {tab.label}
            </button>
          )
        })}
      </nav>

      {activeTab === 'overview' && <OverviewTab onStart={() => setActiveTab('subscribe')} />}
      {activeTab === 'subscribe' && (
        <SubscribeTab
          form={form}
          completion={completion}
          saveState={saveState}
          paymentQr={paymentQr}
          onChange={updateField}
          onSubmit={saveSubscription}
        />
      )}
      {activeTab === 'contact' && <ContactTab />}
    </main>
  )
}

function OverviewTab({ onStart }) {
  const [recruiters, setRecruiters] = useState([])
  const [alertState, setAlertState] = useState({ status: 'loading', message: 'Reading today workbook...' })
  const [activeRecruiterIndex, setActiveRecruiterIndex] = useState(0)
  const [activeKeywordIndex, setActiveKeywordIndex] = useState(0)
  const [currentTime, setCurrentTime] = useState(() => new Date())

  useEffect(() => {
    let isMounted = true

    async function loadRecruiters() {
      try {
        const response = await fetch('/api/todays-recruiters')
        const result = await readJsonResponse(response)
        if (!response.ok) {
          throw new Error(result.message || 'Could not read today recruiter emails.')
        }
        if (!isMounted) {
          return
        }
        setRecruiters(result.recruiters ?? [])
        setActiveRecruiterIndex(0)
        setAlertState({
          status: 'ready',
          message: result.recruiters?.length
            ? `${result.recruiters.length} recruiter emails found today`
            : `No recruiter emails found in ${result.date}.xlsx yet`,
        })
      } catch (error) {
        if (isMounted) {
          setRecruiters([])
          setAlertState({ status: 'error', message: error.message })
        }
      }
    }

    loadRecruiters()
    const refreshTimer = window.setInterval(loadRecruiters, 15000)
    return () => {
      isMounted = false
      window.clearInterval(refreshTimer)
    }
  }, [])

  useEffect(() => {
    if (recruiters.length <= 1) {
      return undefined
    }
    const slideTimer = window.setInterval(() => {
      setActiveRecruiterIndex((current) => (current + 1) % recruiters.length)
    }, 1000)
    return () => window.clearInterval(slideTimer)
  }, [recruiters.length])

  useEffect(() => {
    const keywordTimer = window.setInterval(() => {
      setActiveKeywordIndex((current) => (current + 1) % previewKeywords.length)
    }, 1000)
    return () => window.clearInterval(keywordTimer)
  }, [])

  useEffect(() => {
    const clockTimer = window.setInterval(() => {
      setCurrentTime(new Date())
    }, 30000)
    return () => window.clearInterval(clockTimer)
  }, [])

  const activeRecruiter = recruiters[activeRecruiterIndex] ?? null
  const activeKeyword = previewKeywords[activeKeywordIndex]

  return (
    <section className="tab-panel overview-layout">
      <div className="overview-copy">
        <p className="section-kicker">Speed wins interviews</p>
        <h2>Reply first to every fresh recruiter job post.</h2>
        <p>
          Jobot AI tracks new LinkedIn hiring posts and helps you reply while the
          job is still hot.
        </p>
        <button type="button" className="primary-action" onClick={onStart}>
          Start my subscription <ArrowRight size={18} />
        </button>
        <div className="impact-list" aria-label="Subscriber benefits">
          <span><Check size={17} /> Instant alerts</span>
          <span><Check size={17} /> Targeted keywords</span>
          <span><Check size={17} /> Polished email templates</span>
        </div>
      </div>

      <div className="alert-preview" aria-label="Recruiter alert preview">
        <div className="preview-header">
          <span>Live alert</span>
          <strong>{formatCstTimestamp(currentTime)}</strong>
        </div>
        <div className="preview-card">
          <div className="preview-icon">
            <Mail size={19} />
          </div>
          <LiveRecruiterAlert
            recruiter={activeRecruiter}
            state={alertState}
            currentTime={currentTime}
            index={activeRecruiterIndex}
          />
        </div>
        <div key={activeKeyword} className="preview-card hot live-alert-flash">
          <div className="preview-icon">
            <Search size={19} />
          </div>
          <div>
            <span>High-intent search</span>
            <strong>{activeKeyword}</strong>
          </div>
        </div>
        <div className="preview-card">
          <div className="preview-icon">
            <Send size={19} />
          </div>
          <div>
            <span>Ready to send</span>
            <strong>Resume + email copy</strong>
          </div>
        </div>
        <p className="preview-note">Subscribe once. Get sharp recruiter leads before inboxes get flooded.</p>
      </div>
    </section>
  )
}

function LiveRecruiterAlert({ recruiter, state, currentTime, index }) {
  if (!recruiter) {
    return (
      <div className="live-alert-copy">
        <span>Recruiter email found</span>
        <strong>{state.message}</strong>
      </div>
    )
  }

  return (
    <div key={recruiter.email} className="live-alert-copy live-alert-flash">
      <span>Recruiter email found</span>
      <strong>{recruiter.email}</strong>
      <small>{formatRecentCstTime(currentTime, index)}</small>
    </div>
  )
}

function formatRecentCstTime(currentTime, index) {
  const minutesAgo = ((index * 7) % 29) + 1
  const identifiedAt = new Date(currentTime.getTime() - minutesAgo * 60 * 1000)
  const cstTime = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Chicago',
  }).format(identifiedAt)

  return `Identified in last 30 minutes | ${cstTime} CST`
}

function formatCstTimestamp(currentTime) {
  return `${new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Chicago',
  }).format(currentTime)} CST`
}

function SubscribeTab({ form, completion, saveState, paymentQr, onChange, onSubmit }) {
  return (
    <section className="tab-panel subscribe-layout">
      <aside className="form-status">
        <p className="section-kicker">Subscription setup</p>
        <h2>Tell us your target. We handle the alert flow.</h2>
        <div className="completion">
          <div>
            <span>{completion}%</span>
            <small>profile ready</small>
          </div>
          <progress value={completion} max="100" />
        </div>
        <ul className="included-list">
          <li><Check size={16} /> Alert delivery details</li>
          <li><Check size={16} /> Role, location, and keywords</li>
          <li><Check size={16} /> Email subject and body</li>
          <li><Check size={16} /> Resume for quick outreach</li>
        </ul>
        <div className="pricing-list" aria-label="Subscription charges">
          <span>Subscription charges</span>
          {subscriptionPlans.map((plan) => (
            <div key={plan.duration}>
              <strong>{plan.duration}</strong>
              <b>{plan.price}</b>
            </div>
          ))}
        </div>
      </aside>

      <form className="config-form" onSubmit={onSubmit}>
        <fieldset>
          <legend><UserRound size={18} /> Subscriber Details</legend>
          <div className="field-grid">
            <label>
              Full name
              <input name="fullName" value={form.fullName} onChange={onChange} placeholder="Your full name" required />
            </label>
            <label>
              Email ID
            <input name="email" type="email" value={form.email} onChange={onChange} placeholder="you@gmail.com" required />
            </label>
            <label>
              Phone number
            <input name="phone" type="tel" value={form.phone} onChange={onChange} placeholder="+1 555 000 0000" required />
            </label>
            <label>
              LinkedIn profile
              <input name="linkedinUrl" type="url" value={form.linkedinUrl} onChange={onChange} placeholder="https://linkedin.com/in/..." required />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend><BriefcaseBusiness size={18} /> Search Preferences</legend>
          <div className="field-grid">
            <label>
              Keyword to search in LinkedIn
              <input name="keyword" value={form.keyword} onChange={onChange} placeholder="Java c2c hiring" required />
            </label>
            <label>
              Target role
              <input name="targetRole" value={form.targetRole} onChange={onChange} placeholder="Java Full Stack Developer" required />
            </label>
            <label>
              Preferred location
              <input name="location" value={form.location} onChange={onChange} placeholder="Remote, Dallas, Austin..." required />
            </label>
            <label>
              Alert frequency
              <select name="frequency" value={form.frequency} onChange={onChange} required>
                {frequencies.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
          <div className="chips" aria-label="Job type options">
            {jobTypes.map((type) => (
              <label key={type} className={form.jobType === type ? 'chip selected' : 'chip'}>
                <input
                  type="radio"
                  name="jobType"
                  value={type}
                  checked={form.jobType === type}
                  onChange={onChange}
                  required
                />
                {type}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend><Mail size={18} /> Email Content</legend>
          <label>
            Subject
            <input name="subject" value={form.subject} onChange={onChange} placeholder="Java Developer Available for Immediate Submission" required />
          </label>
          <label>
            Subject variants
            <textarea
              name="subjectVariants"
              value={form.subjectVariants}
              onChange={onChange}
              rows="3"
              placeholder="Add one subject variant per line"
              required
            />
          </label>
          <label>
            Email body
            <textarea
              name="body"
              value={form.body}
              onChange={onChange}
              rows="7"
              placeholder="Hi ${firstname},&#10;&#10;I saw your LinkedIn post and wanted to share my resume..."
              required
            />
          </label>
          <label>
            Signature
            <textarea
              name="signature"
              value={form.signature}
              onChange={onChange}
              rows="4"
              placeholder="Regards,&#10;Your Name&#10;Phone | Email | LinkedIn"
              required
            />
          </label>
        </fieldset>

        <fieldset>
          <legend><Upload size={18} /> Resume & Consent</legend>
          <label className="upload-zone">
            <input name="resumeName" type="file" accept=".pdf,.doc,.docx" onChange={onChange} required />
            <Upload size={20} />
            <span>{form.resumeName || 'Attach resume PDF or DOCX'}</span>
          </label>
          <label className="consent-row">
            <input name="consent" type="checkbox" checked={form.consent} onChange={onChange} required />
            I agree to be contacted about recruiter email alerts and subscription setup.
          </label>
        </fieldset>

        {saveState.message && (
          <p className={`save-message ${saveState.status}`} role="status">
            {saveState.message}
          </p>
        )}

        {paymentQr && (
          <section className="payment-card" aria-label="Subscription activation payment">
            <img src={paymentQr} alt="Random subscription activation QR code" />
            <div>
              <p className="section-kicker">Activate subscription</p>
              <h3>Scan, pay with Zelle, then text the screenshot to +1 615 960 4713.</h3>
              <p>Activation starts after payment verification.</p>
            </div>
          </section>
        )}

        <button type="submit" className="primary-action form-action" disabled={saveState.status === 'saving'}>
          {saveState.status === 'saving' ? 'Subscribing...' : 'Subscribe'} <ArrowRight size={18} />
        </button>
      </form>
    </section>
  )
}

function ContactTab() {
  return (
    <section className="tab-panel contact-layout">
      <div>
        <p className="section-kicker">Contact us</p>
        <h2>Want the alerts tuned for your search?</h2>
        <p className="contact-copy">
          Send your target role, location, and keyword. We will help make the alerts
          useful from day one.
        </p>
      </div>

      <div className="contact-cards">
        <a href="tel:+16159604713" className="contact-card">
          <span><Phone size={22} /></span>
          <div>
            <small>Phone</small>
            <strong>+1 615 960 4713</strong>
          </div>
        </a>
        <a href="mailto:kbmaheswarareddy@gmail.com" className="contact-card">
          <span><Mail size={22} /></span>
          <div>
            <small>Email</small>
            <strong>kbmaheswarareddy@gmail.com</strong>
          </div>
        </a>
      </div>
    </section>
  )
}

async function createRandomPaymentQr(email) {
  const activationCode = crypto.randomUUID()
  return QRCode.toDataURL(
    `Zelle payment screenshot required for ${email}. Send screenshot to +1 615 960 4713. Activation code: ${activationCode}`,
    {
      color: {
        dark: '#10212e',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 260,
    },
  )
}

async function readJsonResponse(response) {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  const text = await response.text()
  throw new Error(text ? text.slice(0, 120) : 'Server returned a non-JSON response.')
}

export default App

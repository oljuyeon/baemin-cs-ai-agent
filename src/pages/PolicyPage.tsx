import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  agentTools,
  caseStore,
  type CsCase,
  type PolicyResult,
} from '../features/cs'
import { CsHeader } from '../components/cs/CsHeader'
import { BackIcon } from '../components/customer/CustomerIcons'
import '../styles/cs.css'

export function PolicyPage() {
  const { caseId = '' } = useParams()
  const { t } = useTranslation('cs')
  const [caseData, setCaseData] = useState<CsCase | null>(null)
  const [policy, setPolicy] = useState<PolicyResult | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    const current = caseStore.getCase(caseId)
    if (!current) {
      setMissing(true)
      setCaseData(null)
      setPolicy(null)
      return
    }
    setMissing(false)
    setCaseData(current)
    let cancelled = false
    void agentTools.getPolicy({ caseData: current }).then((result) => {
      if (!cancelled && result.status === 'success') setPolicy(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [caseId])

  return (
    <main className="cs-page">
      <CsHeader />
      <div className="cs-shell cs-main">
        <Link className="cs-policy-page__back" to={caseData ? `/cs?case=${caseData.caseId}` : '/cs'}>
          <BackIcon />
          {t('policyPage.back')}
        </Link>
        {missing || !caseData ? (
          <section className="cs-detail cs-detail--empty">
            <h2>{t('policyPage.missingTitle')}</h2>
            <p>{t('policyPage.missingBody')}</p>
          </section>
        ) : (
          <article className="cs-policy-page">
            <p className="cs-policy-page__eyebrow">{t('policyPage.eyebrow')}</p>
            <h1>
              {policy
                ? t(`policy.${policy.policyId}`, { defaultValue: policy.policyId })
                : t('detail.loading')}
            </h1>
            <p className="cs-muted">#{caseData.orderId} · {t(`issue.${caseData.issueType}`)}</p>
            <blockquote>{policy?.reason || t('detail.noPolicyReason')}</blockquote>
            <dl className="cs-facts">
              <div>
                <dt>{t('policyPage.allowed')}</dt>
                <dd>
                  {policy
                    ? policy.allowedActions.map((action) => t(`finalAction.${action}`)).join(', ')
                    : t('detail.loading')}
                </dd>
              </div>
              <div>
                <dt>{t('policyPage.merchant')}</dt>
                <dd>{policy ? t(policy.requiresMerchantConfirmation ? 'policyPage.merchantYes' : 'policyPage.merchantNo') : t('detail.loading')}</dd>
              </div>
            </dl>
            <h2>{t('policyPage.situation')}</h2>
            <p>{caseData.customerClaim}</p>
            <p className="cs-muted">
              {caseData.merchantConfirmation?.response
                ? `${t(`merchantResponse.${caseData.merchantConfirmation.response}`)}${caseData.merchantConfirmation.comment ? ` — ${caseData.merchantConfirmation.comment}` : ''}`
                : t('merchantResponse.none')}
            </p>
          </article>
        )}
      </div>
    </main>
  )
}

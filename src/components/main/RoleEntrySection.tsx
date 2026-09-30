import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { roles } from '../../features/roles/roles'
import { ArrowIcon, RoleIcon } from '../common/icons'

export function RoleEntrySection() {
  const { t } = useTranslation('main')
  return (
    <section className="section role-section" id="roles">
      <div className="shell">
        <div className="section-heading section-heading--center">
          <span className="eyebrow">{t('roles.eyebrow')}</span>
          <h2>{t('roles.title')}</h2>
          <p>{t('roles.description')}</p>
        </div>
        <div className="role-grid">
          {roles.map((role) => (
            <Link className={`role-card role-card--${role.id}`} to={role.path} key={role.id}>
              <div className="role-card__top">
                <span className="role-card__icon"><RoleIcon type={role.icon} /></span>
                <span className="role-card__label">{t(`roles.${role.id}.label`)}</span>
              </div>
              <h3>{t(`roles.${role.id}.title`)}</h3>
              <p>{t(`roles.${role.id}.description`)}</p>
              <span className="role-card__action">{t(`roles.${role.id}.action`)}<ArrowIcon /></span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

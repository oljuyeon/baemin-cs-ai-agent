import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import commonEn from '../locales/en/common.json'
import mainEn from '../locales/en/main.json'
import commonKo from '../locales/ko/common.json'
import mainKo from '../locales/ko/main.json'
import customerKo from '../locales/ko/customer.json'
import customerEn from '../locales/en/customer.json'

const storedLanguage = window.localStorage.getItem('app-language')

i18n.use(initReactI18next).init({
  resources: {
    ko: { common: commonKo, main: mainKo, customer: customerKo },
    en: { common: commonEn, main: mainEn, customer: customerEn },
  },
  lng: storedLanguage === 'en' ? 'en' : 'ko',
  fallbackLng: 'ko',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

function updateDocumentMetadata(language: string) {
  window.localStorage.setItem('app-language', language)
  document.documentElement.lang = language
  document.title = i18n.t('meta.title', { ns: 'common' })
  document.querySelector('meta[name="description"]')?.setAttribute(
    'content',
    i18n.t('meta.description', { ns: 'common' }),
  )
}

i18n.on('languageChanged', updateDocumentMetadata)

updateDocumentMetadata(i18n.language)

export default i18n

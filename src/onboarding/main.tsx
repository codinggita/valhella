import { createRoot } from 'react-dom/client'
import Onboarding from './Onboarding'

const el = document.getElementById('root')
if (el) createRoot(el).render(<Onboarding />)

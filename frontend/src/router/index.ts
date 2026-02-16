import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../pages/LoginPage.vue'),
      meta: { guest: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../pages/RegisterPage.vue'),
      meta: { guest: true },
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('../pages/AboutPage.vue'),
    },
    {
      path: '/',
      component: () => import('../components/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: '/docs/lab-guide',
        },
        {
          path: 'docs/:slug',
          name: 'docs',
          component: () => import('../pages/DocsPage.vue'),
        },
        {
          path: 'terminal',
          name: 'terminal',
          component: () => import('../pages/TerminalPage.vue'),
        },
        {
          path: 'monitoring',
          name: 'monitoring',
          component: () => import('../pages/MonitoringPage.vue'),
        },
        {
          path: 'members',
          name: 'members',
          component: () => import('../pages/MembersPage.vue'),
        },
        {
          path: 'change-password',
          name: 'change-password',
          component: () => import('../pages/ChangePasswordPage.vue'),
        },
        // Admin routes
        {
          path: 'admin/invites',
          name: 'admin-invites',
          component: () => import('../pages/admin/InvitesPage.vue'),
          meta: { requiresAdmin: true },
        },
        {
          path: 'admin/requests',
          name: 'admin-requests',
          component: () => import('../pages/admin/RequestsPage.vue'),
          meta: { requiresAdmin: true },
        },
        {
          path: 'admin/docs',
          name: 'admin-docs',
          component: () => import('../pages/admin/DocsEditPage.vue'),
          meta: { requiresAdmin: true },
        },
        {
          path: 'admin/caddy',
          name: 'admin-caddy',
          component: () => import('../pages/admin/CaddyPage.vue'),
          meta: { requiresAdmin: true },
        },
        {
          path: 'admin/users',
          name: 'admin-users',
          component: () => import('../pages/admin/UsersPage.vue'),
          meta: { requiresAdmin: true },
        },
        {
          path: 'admin/email-template',
          name: 'admin-email-template',
          component: () => import('../pages/admin/EmailTemplatePage.vue'),
          meta: { requiresAdmin: true },
        },
        {
          path: 'admin/branding',
          redirect: '/admin/system',
        },
        {
          path: 'admin/system',
          name: 'admin-system',
          component: () => import('../pages/admin/SystemSettingsPage.vue'),
          meta: { requiresAdmin: true },
        },
        {
          path: 'admin/audit',
          name: 'admin-audit',
          component: () => import('../pages/admin/AuditPage.vue'),
          meta: { requiresAdmin: true },
        },
        {
          path: 'admin/monitoring',
          name: 'admin-monitoring',
          component: () => import('../pages/admin/MonitoringNodesPage.vue'),
          meta: { requiresAdmin: true },
        },
      ],
    },
  ],
})

router.beforeEach(async (to, _from, next) => {
  const auth = useAuthStore()

  if (auth.loading) {
    await auth.fetchMe()
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return next({ name: 'login' })
  }

  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return next({ path: '/' })
  }

  if (to.meta.guest && auth.isAuthenticated) {
    return next({ path: '/' })
  }

  next()
})

export default router

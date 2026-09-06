import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./admin-shell').then((m) => m.AdminShell),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        title: 'Admin · Dashboard',
        loadComponent: () => import('./dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'nominations',
        title: 'Admin · Nominations',
        loadComponent: () => import('./nominations').then((m) => m.Nominations),
      },
      {
        path: 'voters',
        title: 'Admin · Voter roll',
        loadComponent: () => import('./voters').then((m) => m.Voters),
      },
    ],
  },
];

import { Routes } from '@angular/router';
import { adminGuard, voterGuard } from './core/guards/auth.guards';

export const routes: Routes = [
  {
    path: '',
    title: 'Sarpanch Election — Home',
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  {
    path: 'login',
    title: 'Sign in',
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    path: 'candidates',
    title: 'Candidates',
    loadComponent: () => import('./features/candidates/candidate-list').then((m) => m.CandidateList),
  },
  {
    path: 'candidates/nominate',
    title: 'File nomination',
    loadComponent: () => import('./features/candidates/nomination-form').then((m) => m.NominationForm),
  },
  {
    path: 'candidates/:id',
    title: 'Candidate',
    loadComponent: () =>
      import('./features/candidates/candidate-detail').then((m) => m.CandidateDetail),
  },
  {
    path: 'vote',
    title: 'Cast your vote',
    canActivate: [voterGuard],
    loadComponent: () => import('./features/vote/ballot').then((m) => m.Ballot),
  },
  {
    path: 'results',
    title: 'Results',
    loadComponent: () => import('./features/results/results').then((m) => m.Results),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  { path: '**', redirectTo: '' },
];

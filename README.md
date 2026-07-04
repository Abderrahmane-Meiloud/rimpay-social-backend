# RIMPay Social — Backend

## 1. Présentation

Ce dépôt contient l'API backend de RIMPay Social, une plateforme institutionnelle de gestion, de suivi et d'analyse des paiements sociaux dans le cadre d'un programme national de type PNRSCS (Programme National de Renforcement du Ciblage Social).

## 2. Rôle du backend dans la plateforme

Le backend expose une API REST sécurisée qui centralise l'ensemble de la logique métier de la plateforme : gestion des bénéficiaires et des programmes, cycle de vie des opérations de paiement, détection d'anomalies, journalisation d'audit, contrôle d'accès basé sur les rôles et génération de rapports. Il constitue la source unique de vérité consommée par l'application frontend.

## 3. Fonctionnalités principales

- Authentification sécurisée et gestion de sessions (JWT, rotation et révocation des sessions).
- Gestion des bénéficiaires (création, affectation, réinclusion/exclusion).
- Gestion des programmes sociaux et des agents de terrain.
- Cycle de vie complet des opérations de paiement (génération, suivi, annulation sécurisée).
- Détection automatique d'anomalies et vérification de cohérence des données de paiement.
- Tableaux de bord analytiques (répartition géographique et temporelle).
- Export de rapports (PDF, Excel).
- Journalisation d'audit non modifiable.
- Contrôle d'accès basé sur les rôles (RBAC).
- Limitation de débit (rate limiting) sur les endpoints sensibles.

## 4. Architecture technique

Le backend suit une architecture modulaire par domaine fonctionnel (module NestJS par ressource métier : bénéficiaires, programmes, opérations de paiement, paiements, agents, anomalies, audit, synchronisation, géographie, tableaux de bord, rapports, utilisateurs).

Chaque module expose ses contrôleurs, services et validations de manière isolée, avec un accès aux données centralisé via Prisma. Les actions sensibles transitent par des gardes d'authentification et de rôles, et sont journalisées dans un module d'audit dédié.

## 5. Technologies utilisées

- NestJS (Node.js / TypeScript)
- Prisma ORM + PostgreSQL
- Passport / JWT pour l'authentification
- Redis (sessions et limitation de débit en production)
- Jest (tests unitaires et end-to-end)

## 6. Structure du projet

```
backend/
├── src/
│   ├── agents/
│   ├── anomalies/
│   ├── audit-logs/
│   ├── auth/
│   ├── beneficiaries/
│   ├── common/
│   ├── dashboard/
│   ├── devices/
│   ├── geography/
│   ├── health/
│   ├── payment-operations/
│   ├── payments/
│   ├── programs/
│   ├── reports/
│   ├── sync/
│   ├── users/
│   ├── app.module.ts
│   └── main.ts
├── prisma/
├── test/
├── scripts/
├── .env.example
├── .env.test.example
└── package.json
```

## 7. Configuration locale

```bash
npm install
cp .env.example .env
npm run start:dev
```

Scripts utiles :

```bash
npm run build       # build de production
npm run start:dev   # démarrage en mode développement
npm run test         # tests unitaires
npm run test:e2e     # tests end-to-end
npm run lint          # analyse statique du code
```

## 8. Variables d'environnement

Le fichier `.env.example` documente les clés de configuration nécessaires, sans valeur sensible. Exemples illustratifs :

```
DATABASE_URL=postgresql://user:password@localhost:5432/rimpay_social
JWT_SECRET=change-me
JWT_EXPIRATION=1h
PORT=3000
```

Aucune valeur réelle n'est présente dans ce dépôt. Chaque environnement doit définir ses propres secrets localement, jamais committés.

## 9. Base de données

Le projet utilise PostgreSQL avec Prisma comme ORM. Le schéma de données modélise les bénéficiaires, programmes, opérations de paiement, agents, rôles et journaux d'audit.

## 10. Migrations Prisma

```bash
npx prisma migrate deploy
npx prisma generate
```

## 11. Tests

```bash
npm run test        # tests unitaires
npm run test:e2e    # tests end-to-end
```

Le plan de tests détaillé (cas de test, domaines couverts) est documenté dans le dépôt de documentation du projet.

## 12. Sécurité

- Aucun fichier `.env` réel, secret, mot de passe ou clé d'API n'est inclus dans ce dépôt.
- Les fichiers `.env.example` ne contiennent que des clés de configuration, sans valeurs sensibles.
- L'authentification repose sur JWT avec rotation et révocation de sessions.
- Le contrôle d'accès est basé sur les rôles (RBAC) et chaque action sensible est journalisée dans un audit non modifiable.
- Une limitation de débit est appliquée sur les endpoints sensibles.
- Ce projet est fourni à des fins académiques et de démonstration ; toute mise en production nécessite un audit de sécurité complémentaire.

## 13. Données de démonstration

Des scripts de seed dédiés permettent de générer des **données entièrement fictives** pour la démonstration et les tests. Ces données ne correspondent à aucune personne réelle et ces scripts ne doivent jamais être exécutés contre une base de données de production.

## 14. Aperçu de l'API

L'API expose des ressources REST organisées par domaine : authentification, bénéficiaires, programmes, opérations de paiement, paiements, agents, anomalies, journaux d'audit, tableaux de bord analytiques, rapports et synchronisation. L'accès à chaque ressource est soumis à un contrôle d'accès basé sur les rôles.

## 15. Statut du projet

Le système est en phase de développement académique. Les fonctionnalités principales sont implémentées et vérifiées.

## 16. Auteur / Contexte académique

> Projet réalisé dans le cadre d'un stage de fin de semestre (Stage S4).

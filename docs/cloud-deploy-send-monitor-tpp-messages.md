# Piano di Deploy Cloud: send-monitor-tpp-messages

> Piano operativo completo per il deploy manuale su AWS del script `send-monitor-tpp-messages`.
> Soluzione scelta: **ECS Fargate Scheduled Tasks + Amazon EventBridge**

---

## Indice

1. [Panoramica](#1-panoramica)
2. [Architettura Target](#2-architettura-target)
3. [Prerequisiti](#3-prerequisiti)
4. [Fase 1 - Preparazione Codice](#4-fase-1---preparazione-codice)
5. [Fase 2 - Setup AWS: ECR Repository](#5-fase-2---setup-aws-ecr-repository)
6. [Fase 3 - Setup AWS: Secrets Manager](#6-fase-3---setup-aws-secrets-manager)
7. [Fase 4 - Setup AWS: IAM Roles](#7-fase-4---setup-aws-iam-roles)
8. [Fase 5 - Setup AWS: CloudWatch Log Group](#8-fase-5---setup-aws-cloudwatch-log-group)
9. [Fase 6 - Build e Push Docker Image](#9-fase-6---build-e-push-docker-image)
10. [Fase 7 - Setup AWS: Networking](#10-fase-7---setup-aws-networking)
11. [Fase 8 - Setup AWS: ECS Cluster e Task Definition](#11-fase-8---setup-aws-ecs-cluster-e-task-definition)
12. [Fase 9 - Setup AWS: EventBridge Scheduler](#12-fase-9---setup-aws-eventbridge-scheduler)
13. [Fase 10 - Test e Validazione](#13-fase-10---test-e-validazione)
14. [Fase 11 - Monitoring e Alerting](#14-fase-11---monitoring-e-alerting)
15. [Troubleshooting](#15-troubleshooting)
16. [Riepilogo Costi](#16-riepilogo-costi)
17. [Appendice A - Variabili Riferimento](#appendice-a---variabili-riferimento)
18. [Appendice B - Perche ECS Fargate](#appendice-b---perche-ecs-fargate)

---

## 1. Panoramica

### Cosa fa lo script

`send-monitor-tpp-messages` monitora i messaggi TPP (Third Party Provider) sulla piattaforma SEND:

1. Esegue una query su **AWS Athena** (`cdc_analytics_database.pn_timelines_json_view`)
2. Aggrega i risultati per fascia oraria
3. Genera un **report CSV**
4. Esegue un'**analisi a soglia** (threshold)
5. Invia il report su **Slack** (messaggio + file CSV allegato)

### Durata e risorse

| Metrica                | Valore                                   |
| ---------------------- | ---------------------------------------- |
| Durata tipica          | 1-5 minuti                               |
| Durata massima teorica | 15-20 minuti (polling Athena worst case) |
| Memoria necessaria     | < 256 MB                                 |
| CPU necessaria         | 0.25 vCPU                                |
| Output CSV             | pochi KB (dati aggregati per ora)        |

### Dipendenze esterne

| Servizio   | Direzione | Protocollo  | Endpoint                          |
| ---------- | --------- | ----------- | --------------------------------- |
| AWS Athena | Outbound  | HTTPS (443) | `athena.eu-south-1.amazonaws.com` |
| AWS S3     | Outbound  | HTTPS (443) | `s3.eu-south-1.amazonaws.com`     |
| AWS Glue   | Outbound  | HTTPS (443) | `glue.eu-south-1.amazonaws.com`   |
| Slack API  | Outbound  | HTTPS (443) | `slack.com`, `files.slack.com`    |

### Schedule richiesto

Lo script deve girare **4 volte al giorno** nei giorni lavorativi:

- 09:00, 11:00, 15:00, 17:00 (ora italiana CET/CEST)

Equivalente UTC (CET = UTC+1, CEST = UTC+2):

- **Inverno (CET)**: `cron(0 8,10,14,16 ? * MON-FRI *)`
- **Estate (CEST)**: `cron(0 7,9,13,15 ? * MON-FRI *)`

> **Nota**: EventBridge usa UTC. Per gestire automaticamente CET/CEST senza modifiche manuali stagionali, si possono creare due regole con timezone oppure usare EventBridge Scheduler che supporta timezone native (vedi Fase 9).

---

## 2. Architettura Target

```
                                    ┌─────────────────────┐
                                    │  EventBridge        │
                                    │  Scheduler          │
                                    │                     │
                                    │  cron: 0 9,11,15,17 │
                                    │  TZ: Europe/Rome    │
                                    └─────────┬───────────┘
                                              │ trigger
                                              ▼
┌──────────┐    ┌─────────────┐    ┌─────────────────────┐
│ Secrets   │◄───│ ECS Fargate │◄───│  ECS Task           │
│ Manager   │    │ Task        │    │  Definition         │
│           │    │             │    │                     │
│ slack-    │    │ Container:  │    │  CPU: 0.25 vCPU     │
│ token     │    │ send-mon-   │    │  RAM: 512 MB        │
└──────────┘    │ itor-tpp    │    │  Image: ECR         │
                │             │    └─────────────────────┘
                └──────┬──────┘
                       │
           ┌───────────┼───────────┐
           │           │           │
           ▼           ▼           ▼
    ┌────────────┐ ┌────────┐ ┌────────┐
    │ Athena     │ │ S3     │ │ Slack  │
    │ (query)    │ │(output)│ │ (API)  │
    └────────────┘ └────────┘ └────────┘
           │
           ▼
    ┌────────────┐
    │ CloudWatch │
    │ Logs       │
    └────────────┘
```

---

## 3. Prerequisiti

### Strumenti necessari

- [ ] AWS CLI v2 installata e configurata (`aws --version`)
- [ ] Docker installato e funzionante (`docker --version`)
- [ ] Accesso alla console AWS con permessi di amministratore
- [ ] Accesso all'account AWS: `510769970275` (o l'account target)
- [ ] Regione target: `eu-south-1` (Milano)

### Informazioni da raccogliere prima di iniziare

Compila questa tabella **prima** di procedere:

| Variabile                  | Valore                                                              | Note                                              |
| -------------------------- | ------------------------------------------------------------------- | ------------------------------------------------- |
| `AWS_ACCOUNT_ID`           | `510769970275`                                                      | Account AWS target                                |
| `AWS_REGION`               | `eu-south-1`                                                        | Regione Milano                                    |
| `VPC_ID`                   | `vpc-XXXXXXXXX`                                                     | VPC esistente con NAT Gateway                     |
| `PRIVATE_SUBNET_IDS`       | `subnet-XXX,subnet-YYY`                                             | Subnet private (con route a NAT)                  |
| `ATHENA_DATABASE`          | `cdc_analytics_database`                                            | Database Athena                                   |
| `ATHENA_OUTPUT_BUCKET`     | `s3://pn-cdc-analytics-athena-results-eu-south-1-510769970275-001/` | Bucket per output Athena                          |
| `ATHENA_SOURCE_BUCKET_ARN` | `arn:aws:s3:::BUCKET-DATI-SORGENTE`                                 | Bucket con i dati di timeline (**da verificare**) |
| `SLACK_TOKEN`              | `xoxb-XXXXXXXX`                                                     | Token bot Slack                                   |
| `SLACK_CHANNEL`            | `CXXXXXXXX`                                                         | Channel ID Slack                                  |
| `ECS_CLUSTER_NAME`         | `go-automation`                                                     | Nome cluster ECS (nuovo o esistente)              |

> **IMPORTANTE**: Il bucket S3 sorgente contenente i dati della tabella `pn_timelines_json_view` deve essere identificato. Puoi trovarlo dalla definizione della tabella in AWS Glue:
>
> ```bash
> aws glue get-table --database-name cdc_analytics_database --name pn_timelines_json_view --query 'Table.StorageDescriptor.Location'
> ```

---

## 4. Fase 1 - Preparazione Codice

### 4.1 Rendere `aws.profile` opzionale

Il parametro `aws.profile` e attualmente `required: true` nel file `src/config.ts` (riga 44). In ambiente ECS il framework GOScript rileva automaticamente l'ambiente AWS-managed e usa la default credential chain (riga 731-733 di `GOScript.ts`), **pero** la validazione dei parametri avviene prima e fallisce se un parametro required non ha valore.

**File**: `scripts/send/send-monitor-tpp-messages/src/config.ts`

**Modifica**: Riga 44, cambiare `required: true` in `required: false`

```typescript
// PRIMA (riga 40-46)
{
  name: 'aws.profile',
  type: Core.GOConfigParameterType.STRING,
  description: 'AWS SSO profile name (e.g., sso_pn-core-prod)',
  required: true,   // ← CAMBIARE
  aliases: ['ap'],
},

// DOPO
{
  name: 'aws.profile',
  type: Core.GOConfigParameterType.STRING,
  description: 'AWS SSO profile name (e.g., sso_pn-core-prod). Optional in cloud environments.',
  required: false,   // ← Cloud usa default credential chain
  aliases: ['ap'],
},
```

**Perche funziona**: Lo script crea il client Athena in `AwsAthenaService.ts` (riga 45-52). Se `ssoProfile` e null/undefined, usa `new AthenaClient({ region })` che utilizza la default credential chain -- esattamente quello che serve in ECS con un Task Role.

### 4.2 Configurare reports folder per ambiente cloud

Il `CSVManager` crea la directory `reports/` dove salva i CSV. In ECS il filesystem e effimero, e il `WORKDIR` e `/app`. Non serve salvare i CSV in modo persistente perche vengono allegati su Slack.

**Nessuna modifica al codice necessaria**: basta passare `REPORTS_FOLDER=/tmp/reports` come variabile d'ambiente nella Task Definition. Il parametro `reports.folder` ha default `reports` ma accetta override da env var.

### 4.3 Verificare il .gitignore

Il file `docker/.env` contiene il token Slack reale. Verificare che sia nel `.gitignore`:

```bash
# Dalla root del progetto
grep -n "docker/.env" .gitignore
```

Risultato atteso (gia presente):

```
43:**/docker/.env
48:!**/docker/.env.example
```

### 4.4 Build e test locale

```bash
# Dalla root del monorepo
pnpm build:common
pnpm --filter=send-monitor-tpp-messages build
```

Verificare che la build passi senza errori dopo la modifica.

### 4.5 Test con Docker locale (opzionale)

```bash
# Dalla root del monorepo
./bins/build-image.sh send-monitor-tpp-messages latest

# Test esecuzione (con .env configurato)
cd scripts/send/send-monitor-tpp-messages/docker
docker compose run --rm app
```

---

## 5. Fase 2 - Setup AWS: ECR Repository

### 5.1 Creare il repository ECR

```bash
aws ecr create-repository \
  --repository-name go-automation/send-monitor-tpp-messages \
  --region eu-south-1 \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=AES256 \
  --image-tag-mutability MUTABLE
```

### 5.2 Configurare lifecycle policy (opzionale, consigliato)

Mantiene solo le ultime 10 immagini per risparmiare storage:

```bash
aws ecr put-lifecycle-policy \
  --repository-name go-automation/send-monitor-tpp-messages \
  --region eu-south-1 \
  --lifecycle-policy-text '{
    "rules": [
      {
        "rulePriority": 1,
        "description": "Keep last 10 images",
        "selection": {
          "tagStatus": "any",
          "countType": "imageCountMoreThan",
          "countNumber": 10
        },
        "action": {
          "type": "expire"
        }
      }
    ]
  }'
```

### 5.3 Annotare l'URI del repository

```bash
aws ecr describe-repositories \
  --repository-names go-automation/send-monitor-tpp-messages \
  --region eu-south-1 \
  --query 'repositories[0].repositoryUri' \
  --output text
```

Risultato atteso:

```
510769970275.dkr.ecr.eu-south-1.amazonaws.com/go-automation/send-monitor-tpp-messages
```

> **Annotare**: `ECR_REPO_URI = 510769970275.dkr.ecr.eu-south-1.amazonaws.com/go-automation/send-monitor-tpp-messages`

---

## 6. Fase 3 - Setup AWS: Secrets Manager

### 6.1 Creare il secret per Slack

```bash
aws secretsmanager create-secret \
  --name go-automation/send-monitor-tpp-messages/slack \
  --region eu-south-1 \
  --description "Slack credentials for send-monitor-tpp-messages" \
  --secret-string '{
    "SLACK_TOKEN": "xoxb-INSERISCI-IL-TUO-TOKEN-QUI",
    "SLACK_CHANNEL": "INSERISCI-CHANNEL-ID-QUI"
  }'
```

> **IMPORTANTE**: Sostituire con i valori reali del token e channel Slack.

### 6.2 Verificare il secret

```bash
aws secretsmanager get-secret-value \
  --secret-id go-automation/send-monitor-tpp-messages/slack \
  --region eu-south-1 \
  --query 'SecretString' \
  --output text
```

### 6.3 Annotare l'ARN del secret

```bash
aws secretsmanager describe-secret \
  --secret-id go-automation/send-monitor-tpp-messages/slack \
  --region eu-south-1 \
  --query 'ARN' \
  --output text
```

> **Annotare**: `SLACK_SECRET_ARN = arn:aws:secretsmanager:eu-south-1:510769970275:secret:go-automation/send-monitor-tpp-messages/slack-XXXXXX`

---

## 7. Fase 4 - Setup AWS: IAM Roles

Servono **2 ruoli IAM**:

| Ruolo                   | Scopo                                            | Utilizzato da               |
| ----------------------- | ------------------------------------------------ | --------------------------- |
| **Task Execution Role** | Pull immagine ECR, leggere secrets, scrivere log | ECS Agent (infrastruttura)  |
| **Task Role**           | Accesso Athena, S3, Glue                         | Il container (applicazione) |

### 7.1 Creare il Task Execution Role

#### 7.1.1 Trust Policy

Salvare come `trust-policy-ecs.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

```bash
aws iam create-role \
  --role-name go-automation-tpp-monitor-execution-role \
  --assume-role-policy-document file://trust-policy-ecs.json \
  --description "ECS Task Execution Role for send-monitor-tpp-messages"
```

#### 7.1.2 Attach managed policy per ECR e CloudWatch Logs

```bash
aws iam attach-role-policy \
  --role-name go-automation-tpp-monitor-execution-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

#### 7.1.3 Inline policy per Secrets Manager

Sostituire `SLACK_SECRET_ARN` con l'ARN annotato nella Fase 3.

```bash
aws iam put-role-policy \
  --role-name go-automation-tpp-monitor-execution-role \
  --policy-name secrets-access \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "secretsmanager:GetSecretValue"
        ],
        "Resource": [
          "SLACK_SECRET_ARN"
        ]
      }
    ]
  }'
```

#### 7.1.4 Annotare l'ARN

```bash
aws iam get-role \
  --role-name go-automation-tpp-monitor-execution-role \
  --query 'Role.Arn' \
  --output text
```

> **Annotare**: `EXECUTION_ROLE_ARN = arn:aws:iam::510769970275:role/go-automation-tpp-monitor-execution-role`

### 7.2 Creare il Task Role

#### 7.2.1 Creare il ruolo

```bash
aws iam create-role \
  --role-name go-automation-tpp-monitor-task-role \
  --assume-role-policy-document file://trust-policy-ecs.json \
  --description "ECS Task Role for send-monitor-tpp-messages (Athena, S3, Glue)"
```

#### 7.2.2 Policy per Athena + S3 (risultati) + Glue

Sostituire `ATHENA_SOURCE_BUCKET_ARN` con l'ARN del bucket sorgente dei dati.

Salvare come `task-role-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AthenaExecution",
      "Effect": "Allow",
      "Action": [
        "athena:StartQueryExecution",
        "athena:GetQueryExecution",
        "athena:GetQueryResults",
        "athena:StopQueryExecution"
      ],
      "Resource": ["arn:aws:athena:eu-south-1:510769970275:workgroup/primary"]
    },
    {
      "Sid": "AthenaResultsBucket",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:GetBucketLocation", "s3:AbortMultipartUpload"],
      "Resource": [
        "arn:aws:s3:::pn-cdc-analytics-athena-results-eu-south-1-510769970275-001",
        "arn:aws:s3:::pn-cdc-analytics-athena-results-eu-south-1-510769970275-001/*"
      ]
    },
    {
      "Sid": "AthenaSourceData",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": ["ATHENA_SOURCE_BUCKET_ARN", "ATHENA_SOURCE_BUCKET_ARN/*"]
    },
    {
      "Sid": "GlueDataCatalog",
      "Effect": "Allow",
      "Action": ["glue:GetTable", "glue:GetPartitions", "glue:GetDatabase"],
      "Resource": [
        "arn:aws:glue:eu-south-1:510769970275:catalog",
        "arn:aws:glue:eu-south-1:510769970275:database/cdc_analytics_database",
        "arn:aws:glue:eu-south-1:510769970275:table/cdc_analytics_database/*"
      ]
    }
  ]
}
```

```bash
aws iam put-role-policy \
  --role-name go-automation-tpp-monitor-task-role \
  --policy-name athena-s3-glue-access \
  --policy-document file://task-role-policy.json
```

#### 7.2.3 Annotare l'ARN

```bash
aws iam get-role \
  --role-name go-automation-tpp-monitor-task-role \
  --query 'Role.Arn' \
  --output text
```

> **Annotare**: `TASK_ROLE_ARN = arn:aws:iam::510769970275:role/go-automation-tpp-monitor-task-role`

---

## 8. Fase 5 - Setup AWS: CloudWatch Log Group

### 8.1 Creare il log group

```bash
aws logs create-log-group \
  --log-group-name /ecs/send-monitor-tpp-messages \
  --region eu-south-1
```

### 8.2 Impostare retention (30 giorni)

```bash
aws logs put-retention-policy \
  --log-group-name /ecs/send-monitor-tpp-messages \
  --retention-in-days 30 \
  --region eu-south-1
```

---

## 9. Fase 6 - Build e Push Docker Image

### 9.1 Build dell'immagine Docker

Dalla root del monorepo:

```bash
./bins/build-image.sh send-monitor-tpp-messages latest
```

Questo comando:

1. Builda `@go-automation/go-common`
2. Builda `send-monitor-tpp-messages`
3. Crea l'artifact standalone con `pnpm deploy --prod`
4. Builda l'immagine Docker: `go-automation/send-monitor-tpp-messages:latest`

### 9.2 Tag dell'immagine per ECR

```bash
# Variabili
ECR_REPO_URI="510769970275.dkr.ecr.eu-south-1.amazonaws.com/go-automation/send-monitor-tpp-messages"
IMAGE_TAG="v2.0.0"  # oppure "latest" o un hash di commit

# Tag
docker tag \
  go-automation/send-monitor-tpp-messages:latest \
  ${ECR_REPO_URI}:${IMAGE_TAG}

# Taggare anche come latest
docker tag \
  go-automation/send-monitor-tpp-messages:latest \
  ${ECR_REPO_URI}:latest
```

### 9.3 Login ECR

```bash
aws ecr get-login-password --region eu-south-1 | \
  docker login --username AWS --password-stdin \
  510769970275.dkr.ecr.eu-south-1.amazonaws.com
```

### 9.4 Push dell'immagine

```bash
docker push ${ECR_REPO_URI}:${IMAGE_TAG}
docker push ${ECR_REPO_URI}:latest
```

### 9.5 Verificare

```bash
aws ecr describe-images \
  --repository-name go-automation/send-monitor-tpp-messages \
  --region eu-south-1 \
  --query 'imageDetails[*].{Tags:imageTags,Size:imageSizeInBytes,Pushed:imagePushedAt}' \
  --output table
```

---

## 10. Fase 7 - Setup AWS: Networking

Lo script necessita di connettivita HTTPS outbound verso:

- Endpoint AWS (Athena, S3, Glue)
- Slack API (internet)

### 10.1 Verificare la VPC esistente

```bash
# Elencare le VPC
aws ec2 describe-vpcs \
  --region eu-south-1 \
  --query 'Vpcs[*].{ID:VpcId,CIDR:CidrBlock,Name:Tags[?Key==`Name`].Value|[0]}' \
  --output table
```

### 10.2 Verificare se esiste un NAT Gateway

```bash
aws ec2 describe-nat-gateways \
  --region eu-south-1 \
  --filter "Name=state,Values=available" \
  --query 'NatGateways[*].{ID:NatGatewayId,VPC:VpcId,Subnet:SubnetId,State:State}' \
  --output table
```

### 10.3 Identificare le subnet private

Le subnet private sono quelle che hanno una route table con route `0.0.0.0/0` verso un NAT Gateway (non un Internet Gateway).

```bash
# Elencare le subnet
aws ec2 describe-subnets \
  --region eu-south-1 \
  --filters "Name=vpc-id,Values=VPC_ID" \
  --query 'Subnets[*].{ID:SubnetId,AZ:AvailabilityZone,CIDR:CidrBlock,Name:Tags[?Key==`Name`].Value|[0]}' \
  --output table
```

Per verificare se una subnet e privata (route verso NAT):

```bash
# Per ogni subnet, trovare la route table associata
aws ec2 describe-route-tables \
  --region eu-south-1 \
  --filters "Name=association.subnet-id,Values=SUBNET_ID" \
  --query 'RouteTables[*].Routes[?DestinationCidrBlock==`0.0.0.0/0`].{Target:NatGatewayId||GatewayId}' \
  --output text
```

- Se il target e `nat-XXXXXXX` → subnet **privata** (corretta)
- Se il target e `igw-XXXXXXX` → subnet **pubblica** (non usare per task Fargate senza IP pubblico)

> **Annotare**: `PRIVATE_SUBNET_IDS` (almeno 2 subnet in AZ diverse per HA)

### 10.4 Se NON esiste un NAT Gateway

**Opzione A** - Usare subnet pubblica con IP pubblico (piu economico, meno sicuro):

- Nella Task Definition usare `assignPublicIp: ENABLED`
- Usare subnet pubbliche (route a Internet Gateway)
- Non serve NAT Gateway

**Opzione B** - Creare un NAT Gateway (~$32/mese):

```bash
# Creare Elastic IP
aws ec2 allocate-address --domain vpc --region eu-south-1

# Creare NAT Gateway nella subnet pubblica
aws ec2 create-nat-gateway \
  --subnet-id SUBNET_PUBBLICA_ID \
  --allocation-id eipalloc-XXXXXXX \
  --region eu-south-1

# Aggiornare route table della subnet privata
aws ec2 create-route \
  --route-table-id rtb-XXXXXXX \
  --destination-cidr-block 0.0.0.0/0 \
  --nat-gateway-id nat-XXXXXXX \
  --region eu-south-1
```

### 10.5 Creare Security Group

```bash
aws ec2 create-security-group \
  --group-name go-automation-tpp-monitor-sg \
  --description "Security group for send-monitor-tpp-messages ECS task" \
  --vpc-id VPC_ID \
  --region eu-south-1
```

Annotare il Security Group ID e aggiungere solo la regola di **egress HTTPS**:

```bash
SG_ID="sg-XXXXXXXX"  # dalla risposta del comando precedente

# Il default egress (0.0.0.0/0 all traffic) e gia presente nei SG AWS.
# Se vuoi restringere solo a HTTPS:

# Rimuovere regola egress default (all traffic)
aws ec2 revoke-security-group-egress \
  --group-id ${SG_ID} \
  --ip-permissions '[{"IpProtocol": "-1", "FromPort": -1, "ToPort": -1, "IpRanges": [{"CidrIp": "0.0.0.0/0"}]}]' \
  --region eu-south-1

# Aggiungere solo HTTPS outbound
aws ec2 authorize-security-group-egress \
  --group-id ${SG_ID} \
  --ip-permissions '[{"IpProtocol": "tcp", "FromPort": 443, "ToPort": 443, "IpRanges": [{"CidrIp": "0.0.0.0/0", "Description": "HTTPS outbound (Athena, S3, Slack)"}]}]' \
  --region eu-south-1
```

> **Nota**: Non serve nessuna regola **ingress** - il task non riceve connessioni.
>
> **Annotare**: `SECURITY_GROUP_ID = sg-XXXXXXXX`

---

## 11. Fase 8 - Setup AWS: ECS Cluster e Task Definition

### 11.1 Creare il cluster ECS (se non esiste)

```bash
aws ecs create-cluster \
  --cluster-name go-automation \
  --region eu-south-1 \
  --capacity-providers FARGATE \
  --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1
```

> Se esiste gia un cluster ECS da condividere, usare quello e saltare questo step.

### 11.2 Creare la Task Definition

Salvare come `task-definition.json`:

> **IMPORTANTE**: Sostituire tutti i placeholder (`XXXXXXX`) con i valori reali annotati nelle fasi precedenti.

```json
{
  "family": "send-monitor-tpp-messages",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::510769970275:role/go-automation-tpp-monitor-execution-role",
  "taskRoleArn": "arn:aws:iam::510769970275:role/go-automation-tpp-monitor-task-role",
  "containerDefinitions": [
    {
      "name": "send-monitor-tpp-messages",
      "image": "510769970275.dkr.ecr.eu-south-1.amazonaws.com/go-automation/send-monitor-tpp-messages:latest",
      "essential": true,
      "environment": [
        { "name": "RUN_MODE", "value": "once" },
        { "name": "NODE_ENV", "value": "production" },
        { "name": "TZ", "value": "Europe/Rome" },
        { "name": "GO_DEPLOYMENT_MODE", "value": "standalone" },
        { "name": "GO_BASE_DIR", "value": "/app" },
        { "name": "AWS_REGION", "value": "eu-south-1" },
        { "name": "ATHENA_DATABASE", "value": "cdc_analytics_database" },
        { "name": "ATHENA_CATALOG", "value": "AwsDataCatalog" },
        { "name": "ATHENA_WORKGROUP", "value": "primary" },
        {
          "name": "ATHENA_OUTPUT_LOCATION",
          "value": "s3://pn-cdc-analytics-athena-results-eu-south-1-510769970275-001/"
        },
        { "name": "ATHENA_MAX_RETRIES", "value": "60" },
        { "name": "ATHENA_RETRY_DELAY", "value": "15000" },
        { "name": "REPORTS_FOLDER", "value": "/tmp/reports" },
        { "name": "ANALYSIS_THRESHOLD_FIELD", "value": "notifiche_tpp" },
        { "name": "ANALYSIS_THRESHOLD", "value": "100" }
      ],
      "secrets": [
        {
          "name": "SLACK_TOKEN",
          "valueFrom": "arn:aws:secretsmanager:eu-south-1:510769970275:secret:go-automation/send-monitor-tpp-messages/slack:SLACK_TOKEN::"
        },
        {
          "name": "SLACK_CHANNEL",
          "valueFrom": "arn:aws:secretsmanager:eu-south-1:510769970275:secret:go-automation/send-monitor-tpp-messages/slack:SLACK_CHANNEL::"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/send-monitor-tpp-messages",
          "awslogs-region": "eu-south-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "readonlyRootFilesystem": false,
      "linuxParameters": {
        "initProcessEnabled": true
      }
    }
  ],
  "runtimePlatform": {
    "cpuArchitecture": "X86_64",
    "operatingSystemFamily": "LINUX"
  }
}
```

#### Note sulla Task Definition:

- **`cpu: 256` (0.25 vCPU)** e **`memory: 512`** (512 MB): Sufficienti per questo workload. Il CSV e di pochi KB e il polling Athena usa memoria minima.
- **`RUN_MODE: once`**: Il container esegue lo script una volta ed esce. EventBridge lo rilancia ad ogni schedule.
- **`readonlyRootFilesystem: false`**: Necessario perche il CSVManager scrive in `/tmp/reports`.
- **`initProcessEnabled: true`**: Gestisce correttamente i segnali per il graceful shutdown.
- **`secrets`**: I valori vengono iniettati come variabili d'ambiente dal secret JSON. La sintassi `secretArn:jsonKey::` estrae la singola chiave dal JSON.

> **ATTENZIONE**: L'ARN del secret in `secrets[].valueFrom` deve includere il suffisso random generato da Secrets Manager (es. `-AbCdEf`). Usa l'ARN completo annotato nella Fase 3.

#### Registrare la Task Definition:

```bash
aws ecs register-task-definition \
  --cli-input-json file://task-definition.json \
  --region eu-south-1
```

#### Verificare:

```bash
aws ecs describe-task-definition \
  --task-definition send-monitor-tpp-messages \
  --region eu-south-1 \
  --query 'taskDefinition.{Family:family,Revision:revision,Status:status,CPU:cpu,Memory:memory}' \
  --output table
```

---

## 12. Fase 9 - Setup AWS: EventBridge Scheduler

Usare **Amazon EventBridge Scheduler** (non le vecchie EventBridge Rules) perche supporta **timezone native** - cosi non serve gestire manualmente i cambi CET/CEST.

### 12.1 Creare il ruolo IAM per lo Scheduler

Lo Scheduler ha bisogno di un ruolo IAM per lanciare ECS tasks.

```bash
# Trust policy per Scheduler
cat > trust-policy-scheduler.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "scheduler.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
  --role-name go-automation-tpp-monitor-scheduler-role \
  --assume-role-policy-document file://trust-policy-scheduler.json \
  --description "EventBridge Scheduler role for send-monitor-tpp-messages"
```

#### Policy per lanciare ECS tasks:

Sostituire `EXECUTION_ROLE_ARN` e `TASK_ROLE_ARN` con i valori reali.

```bash
aws iam put-role-policy \
  --role-name go-automation-tpp-monitor-scheduler-role \
  --policy-name ecs-run-task \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "ecs:RunTask"
        ],
        "Resource": [
          "arn:aws:ecs:eu-south-1:510769970275:task-definition/send-monitor-tpp-messages:*"
        ]
      },
      {
        "Effect": "Allow",
        "Action": [
          "iam:PassRole"
        ],
        "Resource": [
          "EXECUTION_ROLE_ARN",
          "TASK_ROLE_ARN"
        ]
      }
    ]
  }'
```

### 12.2 Creare lo Schedule

Sostituire tutti i placeholder con i valori reali.

```bash
aws scheduler create-schedule \
  --name send-monitor-tpp-messages-schedule \
  --schedule-expression "cron(0 9,11,15,17 ? * MON-FRI *)" \
  --schedule-expression-timezone "Europe/Rome" \
  --flexible-time-window '{"Mode": "OFF"}' \
  --state ENABLED \
  --target '{
    "Arn": "arn:aws:ecs:eu-south-1:510769970275:cluster/go-automation",
    "RoleArn": "arn:aws:iam::510769970275:role/go-automation-tpp-monitor-scheduler-role",
    "EcsParameters": {
      "TaskDefinitionArn": "arn:aws:ecs:eu-south-1:510769970275:task-definition/send-monitor-tpp-messages",
      "TaskCount": 1,
      "LaunchType": "FARGATE",
      "NetworkConfiguration": {
        "AwsvpcConfiguration": {
          "Subnets": ["SUBNET_PRIVATA_1", "SUBNET_PRIVATA_2"],
          "SecurityGroups": ["SECURITY_GROUP_ID"],
          "AssignPublicIp": "DISABLED"
        }
      },
      "PlatformVersion": "LATEST",
      "EnableExecuteCommand": false
    },
    "RetryPolicy": {
      "MaximumEventAgeInSeconds": 3600,
      "MaximumRetryAttempts": 2
    }
  }' \
  --region eu-south-1
```

#### Spiegazione dei parametri:

| Parametro                          | Valore                             | Spiegazione                                  |
| ---------------------------------- | ---------------------------------- | -------------------------------------------- |
| `schedule-expression`              | `cron(0 9,11,15,17 ? * MON-FRI *)` | Ore 9, 11, 15, 17, lun-ven                   |
| `schedule-expression-timezone`     | `Europe/Rome`                      | Gestisce automaticamente CET/CEST            |
| `flexible-time-window`             | `OFF`                              | Esecuzione puntuale (no finestra flessibile) |
| `AssignPublicIp`                   | `DISABLED`                         | Subnet privata con NAT                       |
| `RetryPolicy.MaximumRetryAttempts` | `2`                                | Riprova fino a 2 volte se il task fallisce   |

> **Se usi subnet pubblica** (senza NAT): cambia `AssignPublicIp` in `ENABLED` e usa gli ID delle subnet pubbliche.

### 12.3 Verificare lo schedule

```bash
aws scheduler get-schedule \
  --name send-monitor-tpp-messages-schedule \
  --region eu-south-1
```

---

## 13. Fase 10 - Test e Validazione

### 13.1 Eseguire manualmente un ECS Task

```bash
aws ecs run-task \
  --cluster go-automation \
  --task-definition send-monitor-tpp-messages \
  --launch-type FARGATE \
  --network-configuration '{
    "awsvpcConfiguration": {
      "subnets": ["SUBNET_PRIVATA_1", "SUBNET_PRIVATA_2"],
      "securityGroups": ["SECURITY_GROUP_ID"],
      "assignPublicIp": "DISABLED"
    }
  }' \
  --region eu-south-1
```

Annotare il `taskArn` dalla risposta.

### 13.2 Monitorare lo stato del task

```bash
TASK_ARN="arn:aws:ecs:eu-south-1:510769970275:task/go-automation/TASK_ID"

# Controllare lo stato
aws ecs describe-tasks \
  --cluster go-automation \
  --tasks ${TASK_ARN} \
  --region eu-south-1 \
  --query 'tasks[0].{Status:lastStatus,DesiredStatus:desiredStatus,StoppedReason:stoppedReason,ExitCode:containers[0].exitCode}' \
  --output table
```

### 13.3 Verificare i log su CloudWatch

```bash
# Trovare il log stream (il nome include il task ID)
aws logs describe-log-streams \
  --log-group-name /ecs/send-monitor-tpp-messages \
  --region eu-south-1 \
  --order-by LastEventTime \
  --descending \
  --limit 5 \
  --query 'logStreams[*].logStreamName' \
  --output text

# Leggere i log
aws logs get-log-events \
  --log-group-name /ecs/send-monitor-tpp-messages \
  --log-stream-name "ecs/send-monitor-tpp-messages/TASK_ID" \
  --region eu-south-1 \
  --query 'events[*].message' \
  --output text
```

### 13.4 Checklist di validazione

- [ ] Il task parte senza errori
- [ ] I log mostrano "Script completed successfully"
- [ ] Il container esce con exit code 0
- [ ] Il messaggio Slack arriva nel canale corretto
- [ ] Il CSV e allegato al messaggio Slack
- [ ] L'analisi threshold e presente nel messaggio
- [ ] Il task completa in < 10 minuti

### 13.5 Test dello scheduling (giorno dopo)

Verificare che EventBridge lanci correttamente il task:

```bash
# Elencare i task recenti
aws ecs list-tasks \
  --cluster go-automation \
  --family send-monitor-tpp-messages \
  --region eu-south-1 \
  --desired-status STOPPED \
  --query 'taskArns' \
  --output text
```

---

## 14. Fase 11 - Monitoring e Alerting

### 14.1 Creare un SNS Topic per gli alert

```bash
aws sns create-topic \
  --name go-automation-alerts \
  --region eu-south-1

# Sottoscrivere un'email
aws sns subscribe \
  --topic-arn arn:aws:sns:eu-south-1:510769970275:go-automation-alerts \
  --protocol email \
  --notification-endpoint tuo-team@pagopa.it \
  --region eu-south-1
```

> **Nota**: Confermare la sottoscrizione cliccando il link nell'email ricevuta.

### 14.2 Metric Filter per errori nei log

```bash
aws logs put-metric-filter \
  --log-group-name /ecs/send-monitor-tpp-messages \
  --filter-name tpp-monitor-errors \
  --filter-pattern '?"Error" ?"error" ?"FAILED" ?"exited with code 1"' \
  --metric-transformations '[{
    "metricNamespace": "GOAutomation",
    "metricName": "TPPMonitorErrors",
    "metricValue": "1",
    "defaultValue": 0
  }]' \
  --region eu-south-1
```

### 14.3 CloudWatch Alarm per fallimenti

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name send-monitor-tpp-messages-failures \
  --alarm-description "Alert when send-monitor-tpp-messages fails" \
  --namespace GOAutomation \
  --metric-name TPPMonitorErrors \
  --statistic Sum \
  --period 3600 \
  --evaluation-periods 1 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --alarm-actions arn:aws:sns:eu-south-1:510769970275:go-automation-alerts \
  --treat-missing-data notBreaching \
  --region eu-south-1
```

### 14.4 Alarm per task non eseguiti (opzionale)

Se vuoi essere avvisato quando un task scheduled non parte:

```bash
# Alarm se nessun task viene eseguito in un giorno feriale
aws cloudwatch put-metric-alarm \
  --alarm-name send-monitor-tpp-messages-no-execution \
  --alarm-description "No TPP monitor tasks executed in the last 24 hours" \
  --namespace AWS/ECS \
  --metric-name RunningTaskCount \
  --dimensions Name=ClusterName,Value=go-automation \
  --statistic Maximum \
  --period 86400 \
  --evaluation-periods 1 \
  --threshold 0 \
  --comparison-operator LessThanOrEqualToThreshold \
  --alarm-actions arn:aws:sns:eu-south-1:510769970275:go-automation-alerts \
  --treat-missing-data breaching \
  --region eu-south-1
```

---

## 15. Troubleshooting

### Problema: Il task non parte

**Sintomo**: Il task rimane in stato `PROVISIONING` o passa direttamente a `STOPPED`.

```bash
# Controllare il motivo dello stop
aws ecs describe-tasks \
  --cluster go-automation \
  --tasks TASK_ARN \
  --region eu-south-1 \
  --query 'tasks[0].{StoppedReason:stoppedReason,StopCode:stopCode,Containers:containers[*].{Name:name,ExitCode:exitCode,Reason:reason}}'
```

**Cause comuni**:
| Errore | Causa | Soluzione |
|--------|-------|-----------|
| `CannotPullContainerError` | ECR image non trovata o permessi | Verificare ECR URI e Execution Role |
| `ResourceNotFoundException` | Secret non trovato | Verificare ARN del secret con suffisso random |
| `TaskFailedToStart` | Risorse insufficienti | Verificare CPU/Memory nella task definition |
| `OutOfMemoryError` | Memoria insufficiente | Aumentare `memory` nella task definition |

### Problema: Il container parte ma lo script fallisce

**Sintomo**: Exit code 1 nei log del container.

```bash
# Leggere i log completi
aws logs tail /ecs/send-monitor-tpp-messages --region eu-south-1 --since 1h
```

**Cause comuni**:
| Errore nei log | Causa | Soluzione |
|---------------|-------|-----------|
| `AWS profile is required` | `aws.profile` ancora required | Applicare modifica Fase 1 |
| `Query failed: ...` | Permessi Athena insufficienti | Verificare Task Role policy |
| `Access Denied` su S3 | Manca permesso sul bucket sorgente | Aggiungere bucket ARN alla policy |
| `Slack connection failed` | Token Slack invalido | Aggiornare secret in Secrets Manager |
| `ECONNREFUSED` / `ETIMEDOUT` | Nessuna connettivita outbound | Verificare NAT Gateway / Security Group |

### Problema: EventBridge non lancia il task

```bash
# Verificare lo schedule
aws scheduler get-schedule \
  --name send-monitor-tpp-messages-schedule \
  --region eu-south-1 \
  --query '{State:State,Schedule:ScheduleExpression,TZ:ScheduleExpressionTimezone}'
```

**Cause comuni**:

- Schedule in stato `DISABLED`
- Ruolo Scheduler senza permessi `ecs:RunTask` o `iam:PassRole`
- Subnet/Security Group non validi nella configurazione di rete

---

## 16. Riepilogo Costi

### Costo mensile stimato (4 esecuzioni/giorno, ~22 giorni lavorativi)

| Componente                                            | Calcolo                                                    | Costo/mese       |
| ----------------------------------------------------- | ---------------------------------------------------------- | ---------------- |
| **ECS Fargate** (0.25 vCPU, 512 MB, 5 min/esecuzione) | 88 esecuzioni x 5 min x ($0.04048/h vCPU + $0.004445/h GB) | ~$1.00           |
| **ECR Storage**                                       | ~100 MB immagine                                           | ~$0.01           |
| **CloudWatch Logs**                                   | ~50 MB/mese                                                | ~$0.03           |
| **Secrets Manager**                                   | 1 secret x $0.40 + API calls                               | ~$0.50           |
| **EventBridge Scheduler**                             | Gratuito per schedule semplici                             | $0.00            |
| **NAT Gateway** (se condiviso)                        | Costo gia sostenuto dall'infrastruttura                    | $0.00            |
| **NAT Gateway** (se dedicato)                         | $0.048/h + data transfer                                   | ~$35.00          |
|                                                       |                                                            |                  |
| **TOTALE (NAT condiviso)**                            |                                                            | **~$1.50/mese**  |
| **TOTALE (NAT dedicato)**                             |                                                            | **~$36.50/mese** |

---

## Appendice A - Variabili Riferimento

Tabella riepilogativa di tutte le variabili da raccogliere durante il processo:

| Variabile                  | Fase | Valore          |
| -------------------------- | ---- | --------------- |
| `AWS_ACCOUNT_ID`           | 3    | `510769970275`  |
| `AWS_REGION`               | 3    | `eu-south-1`    |
| `ECR_REPO_URI`             | 5    |                 |
| `SLACK_SECRET_ARN`         | 6    |                 |
| `EXECUTION_ROLE_ARN`       | 7    |                 |
| `TASK_ROLE_ARN`            | 7    |                 |
| `VPC_ID`                   | 10   |                 |
| `PRIVATE_SUBNET_IDS`       | 10   |                 |
| `SECURITY_GROUP_ID`        | 10   |                 |
| `ECS_CLUSTER_NAME`         | 11   | `go-automation` |
| `ATHENA_SOURCE_BUCKET_ARN` | 3/7  |                 |

---

## Appendice B - Perche ECS Fargate

### Confronto con le alternative

| Criterio           | Lambda + EventBridge                                         | **ECS Fargate (scelto)** | Step Functions | EC2 + cron |
| ------------------ | ------------------------------------------------------------ | ------------------------ | -------------- | ---------- |
| Costo/mese         | ~$0.20                                                       | **~$1.50**               | ~$0.50         | ~$10       |
| Refactoring codice | **ALTO** (no CLI framework, no file system, no process.exit) | **NESSUNO**              | **MOLTO ALTO** | NESSUNO    |
| Timeout max        | 15 min (rischio!)                                            | **Illimitato**           | Illimitato     | Illimitato |
| Docker gia pronto  | No                                                           | **Si**                   | No             | No         |
| Manutenzione       | Bassa                                                        | **Bassa**                | Media          | Alta       |
| Gestione timezone  | Manuale                                                      | **Nativa (Scheduler)**   | Manuale        | Manuale    |

### Perche non Lambda

Lo script usa:

- `process.exit()` (incompatibile con Lambda handler)
- File system sync per CSV (`fsSync.writeFileSync`, `fsSync.mkdirSync`)
- Spinner e TTY detection (framework GOScript)
- Query Athena con polling che puo durare fino a 15 minuti (limite Lambda)
- `child_process.spawn` nel modo cron

Adattare tutto questo a Lambda richiederebbe un refactoring significativo del framework GOScript e dello script stesso.

### Perche ECS Fargate

- Il `Dockerfile.runtime` e il `docker-entrypoint.sh` esistono gia e funzionano
- Il `bins/build-image.sh` produce l'immagine Docker pronta
- Il framework `GOExecutionEnvironment` (riga 241 di GOExecutionEnvironment.ts) rileva gia `ECS_CONTAINER_METADATA_URI` e setta `type: AWS_ECS`
- `GOScript.handleAWSCredentials()` (riga 731) salta la validazione SSO e usa la default credential chain in ambienti AWS-managed
- L'unica modifica necessaria e rendere `aws.profile` opzionale (1 riga)

---

_Documento generato il 2026-02-17_
_Soluzione validata su: go-automation v2.0.0, GOScript framework, Docker setup esistente_

---
name: frontend-project-structure
description: Application vs infrastructure layers, domain entities, ports, use-cases, repositories, DTOs, mappers. Domain-First principle - always use domain entities, map API responses with mappers. Keywords: layer, domain, entity, port, use case, DTO, mapper, transform, API response, toDomain, toDto.
---

# Clean Architecture Layers (Frontend)

## Layer Structure

Each feature follows this layer structure:

```
feature/
├── application/          # BUSINESS LOGIC (framework-agnostic)
│   ├── domain/
│   │   └── entities/     # Domain models/interfaces
│   ├── ports/            # Repository interfaces (contracts)
│   ├── use-cases/        # Business logic classes
│   └── validators/       # Zod schemas for validation
│
└── infra/                # INFRASTRUCTURE (framework-specific)
    ├── di/               # Dependency injection context
    ├── repositories/     # API implementations of ports
    ├── dto/              # Data transfer objects + mappers
    ├── store/            # Redux slices (when needed)
    └── ui/               # React components
        ├── pages/        # Page/screen components
        ├── components/   # Reusable UI components
        └── view-models/  # Custom hooks (useXxxViewModel)
```

---

## Layer Responsibilities

| Layer | Purpose | Example |
|-------|---------|---------|
| `domain/entities` | Pure TypeScript interfaces representing business data | `AuditLogItem.ts` |
| `ports` | Interfaces that define repository contracts | `AuditLogRepository.ts` |
| `use-cases` | Business logic, orchestrates domain and ports | `FetchAuditLogsUseCase.ts` |
| `validators` | Zod schemas with i18n support | `section-one.schema.ts` |
| `di` | React Context for dependency injection | `AuditLogDIContext.tsx` |
| `repositories` | HTTP implementations using HttpClient | `ApiAuditLogRepository.ts` |
| `dto` | DTOs and mappers (API ↔ Domain) | `AuditLogMapper.ts` |
| `ui/view-models` | Custom hooks managing UI state/logic | `useAuditLogViewModel.ts` |
| `ui/pages` | Page components (route endpoints) | `AuditLogScreen.tsx` |
| `ui/components` | Presentational components | `AuditLogTable.tsx` |

---

## Domain-First Principle

> **Use domain entities everywhere in the application. Use DTOs and Mappers only at the boundary (API communication).**

This ensures domain logic remains unchanged when external factors (API response structure, backend changes) change.

### Data Flow

```
API Response (JSON)
    ↓
DTO (matches API structure)
    ↓
Mapper.toDomain()
    ↓
Domain Entity (used in use-cases, UI, everywhere)
    ↓
Mapper.toDto() (when sending data)
    ↓
Request DTO
    ↓
API Request
```

### Example

```typescript
// ❌ WRONG - Using API response structure directly
const items = response.data; // API structure leaks into app

// ✅ CORRECT - Map to domain entity
const items = response.data.map(dto => AuditLogMapper.toDomain(dto));
```

### Benefits

- Domain logic is **isolated** from API changes
- Backend can change response format without breaking UI
- Single source of truth for business data structure
- Easier testing (mock domain entities, not API responses)

---

## DTO and Mapper Pattern

### DTO (Data Transfer Object)

Matches the exact API response/request structure:

```typescript
// infra/dto/AuditLogResponseDto.ts
export interface AuditLogResponseDto {
  section_name: string;    // API uses snake_case
  field: string;
  old_value?: string;
  new_value: string;
  change_type: string;
  timestamp: string;
  ip_address: string;
  changed_by: string;
}
```

### Domain Entity

Business representation used throughout the app:

```typescript
// application/domain/entities/AuditLogItem.ts
export interface AuditLogItem {
  sectionName: string;    // Domain uses camelCase
  field: string;
  oldValue?: string;
  newValue: string;
  changeType: string;
  timestamp: string;
  ipAddress: string;
  changedBy: string;
}
```

### Mapper

Converts between DTO and Domain:

```typescript
// infra/dto/AuditLogMapper.ts
export class AuditLogMapper {
  static toDomain(dto: AuditLogResponseDto): AuditLogItem {
    return {
      sectionName: dto.section_name,
      field: dto.field,
      oldValue: dto.old_value,
      newValue: dto.new_value,
      changeType: dto.change_type,
      timestamp: dto.timestamp,
      ipAddress: dto.ip_address,
      changedBy: dto.changed_by,
    };
  }

  static toDto(domain: AuditLogItem): AuditLogRequestDto {
    return {
      section_name: domain.sectionName,
      field: domain.field,
      // ... map all fields
    };
  }
}
```

---

## Reference Implementation

Use `src/features/audit_logs/` as the reference:

| File | Purpose |
|------|---------|
| `application/domain/entities/AuditLogItem.ts` | Domain entity interface |
| `application/ports/AuditLogRepository.ts` | Repository port (interface) |
| `application/use-cases/FetchAuditLogsUseCase.ts` | Use case class |
| `infra/repositories/ApiAuditLogRepository.ts` | Repository implementation |
| `infra/dto/AuditLogMapper.ts` | DTO to domain mapper |

import {
  Column,
  CreatedAt,
  DataType,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
} from 'sequelize';
import { SqlSchema } from '../../../../../../config/database/sql/sql-schema.constants';
import {
  DefectType,
  InspectionStatus,
  Severity,
} from '../../../../type/inspection.enum';

@Table({
  schema: SqlSchema.App,
  tableName: 'inspections',
  timestamps: true,
  underscored: true,
})
export class InspectionModel extends Model<
  InferAttributes<InspectionModel>,
  InferCreationAttributes<InspectionModel>
> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: CreationOptional<string>;

  @Column({ type: DataType.UUID, allowNull: false })
  declare clientUuid: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare plantId: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare loggedByUserId: string;

  /**
   * DATEONLY, and the attribute stays a `string`.
   *
   * Never assign a JS Date here: Sequelize's DATEONLY stringifier formats in the
   * PROCESS-LOCAL timezone, so in a UTC container
   * `new Date('2026-09-01T00:00:00+05:30')` would be written as 2026-08-31.
   * Postgres also parses DATE back out as a plain string, so string-in/string-out
   * is the only representation with no timezone in the path at all.
   */
  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare inspectionDate: string;

  @Column({ type: DataType.STRING(50), allowNull: false })
  declare machineLineId: string;

  // varchar + validate, mirroring the migration's CHECK.
  @Column({
    type: DataType.STRING(40),
    allowNull: false,
    validate: { isIn: [Object.values(DefectType)] },
  })
  declare defectType: DefectType;

  // The one genuine native enum. DataType.ENUM on a non-public schema resolves to
  // "app"."enum_inspections_severity", which is exactly what the migration creates.
  @Column({
    type: DataType.ENUM(...Object.values(Severity)),
    allowNull: false,
  })
  declare severity: Severity;

  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: InspectionStatus.Open,
    validate: { isIn: [Object.values(InspectionStatus)] },
  })
  declare status: CreationOptional<InspectionStatus>;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare remarks: CreationOptional<string | null>;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare resolutionNote: CreationOptional<string | null>;

  @Column({ type: DataType.UUID, allowNull: true })
  declare resolvedByUserId: CreationOptional<string | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  declare resolvedAt: CreationOptional<Date | null>;

  @Column({ type: DataType.DATE, allowNull: false })
  declare loggedAt: Date;

  // Decorated rather than left implicit: `timestamps: true` alone does not register
  // these in rawAttributes, so Sequelize emits a BARE `ORDER BY "createdAt"` that
  // only resolves via the SELECT output alias -- and would become ambiguous the
  // moment a query joins another table that also has created_at.
  @CreatedAt
  @Column({ type: DataType.DATE, allowNull: false })
  declare readonly createdAt: CreationOptional<Date>;

  @UpdatedAt
  @Column({ type: DataType.DATE, allowNull: false })
  declare readonly updatedAt: CreationOptional<Date>;
}

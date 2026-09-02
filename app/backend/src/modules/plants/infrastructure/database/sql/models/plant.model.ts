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

// underscored: true -- attributes stay camelCase in TypeScript while the actual
// columns are snake_case, which is what the migrations create. It also covers the
// timestamps, mapping createdAt/updatedAt to created_at/updated_at.
@Table({
  schema: SqlSchema.App,
  tableName: 'plants',
  timestamps: true,
  underscored: true,
})
export class PlantModel extends Model<
  InferAttributes<PlantModel>,
  InferCreationAttributes<PlantModel>
> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: CreationOptional<string>;

  @Column({ type: DataType.STRING(16), unique: true, allowNull: false })
  declare code: string;

  @Column({ type: DataType.STRING(120), allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare city: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare state: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare isActive: CreationOptional<boolean>;

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

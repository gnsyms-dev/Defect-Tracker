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
import { UserRole } from '../../../../../../shared/enums/user-role.enum';

@Table({
  schema: SqlSchema.App,
  tableName: 'users',
  timestamps: true,
  underscored: true,
})
export class UserModel extends Model<
  InferAttributes<UserModel>,
  InferCreationAttributes<UserModel>
> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: CreationOptional<string>;

  @Column({ type: DataType.STRING(160), unique: true, allowNull: false })
  declare email: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare passwordHash: string;

  @Column({ type: DataType.STRING(120), allowNull: false })
  declare fullName: string;

  // STRING + validate, mirroring the migration's varchar + CHECK. Not
  // DataType.ENUM: roles have no ordinal use and are the most likely thing to be
  // added AND rolled back, and a Postgres enum can never have a value removed.
  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    validate: { isIn: [Object.values(UserRole)] },
  })
  declare role: UserRole;

  @Column({ type: DataType.UUID, allowNull: false })
  declare plantId: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare isActive: CreationOptional<boolean>;

  @Column({ type: DataType.DATE, allowNull: true })
  declare lastLoginAt: CreationOptional<Date | null>;

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

import { Column, DataType, Model, Table } from 'sequelize-typescript';
import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
} from 'sequelize';
import { SqlSchema } from '../../../../../../config/database/sql/sql-schema.constants';
import { UserRole } from '../../../../type/auth.enum';

@Table({ schema: SqlSchema.Hakka, tableName: 'auth_users', timestamps: true })
export class AuthUserModel extends Model<
  InferAttributes<AuthUserModel>,
  InferCreationAttributes<AuthUserModel>
> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: CreationOptional<string>;

  @Column({ type: DataType.STRING, unique: true, allowNull: false })
  declare email: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare passwordHash: string;

  @Column({
    type: DataType.ENUM(...Object.values(UserRole)),
    allowNull: false,
    defaultValue: UserRole.User,
  })
  declare role: CreationOptional<UserRole>;

  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

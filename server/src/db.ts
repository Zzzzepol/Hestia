import { PrismaClient } from '@prisma/client';
import './config.js';

export const prisma = new PrismaClient();

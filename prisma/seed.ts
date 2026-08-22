import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma.js'

async function main() {
  const passwordHash = await bcrypt.hash('123456', 10)

  await prisma.user.upsert({
    where: { email: 'admin@salao.com' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@salao.com',
      password: passwordHash,
      role: 'ADMIN',
    },
  })

  console.log('Usuário admin criado/atualizado com sucesso.')
  console.log('Login: admin@salao.com / Senha: 123456')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

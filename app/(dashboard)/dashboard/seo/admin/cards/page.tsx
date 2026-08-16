import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, Pencil } from 'lucide-react';
import { getUser, getUserTenantRoleNames } from '@/lib/db/queries';
import { getKnowledgeCardsByStage } from '@/lib/seo/queries';
import { getSeoManifest } from '@/lib/seo/manifest';
import { DeleteCardButton } from './delete-card-button';

const ADMIN_ROLES = ['admin', 'super_admin'];

export default async function SeoAdminCardsPage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const roleNames = await getUserTenantRoleNames(user.id);
  if (!roleNames.some((r) => ADMIN_ROLES.includes(r))) {
    redirect('/dashboard');
  }

  const manifest = getSeoManifest();
  const cardsByStage = await getKnowledgeCardsByStage();

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg lg:text-2xl font-medium">
          Admin SEO — Tarjetas
        </h1>
        <Link href="/dashboard/seo/admin/cards/new">
          <Button className="bg-orange-500 hover:bg-orange-600 text-white">
            <PlusCircle className="mr-2 h-4 w-4" />
            Nueva tarjeta
          </Button>
        </Link>
      </div>

      {manifest.stages.map((stage) => {
        const cards = cardsByStage[stage.key] ?? [];
        return (
          <Card key={stage.key} className="mb-6">
            <CardHeader>
              <CardTitle>{stage.name}</CardTitle>
            </CardHeader>
            <CardContent>
              {cards.length === 0 ? (
                <p className="text-muted-foreground">
                  Sin tarjetas todavía.
                </p>
              ) : (
                <ul className="space-y-4">
                  {cards.map((card) => (
                    <li
                      key={card.id}
                      className="flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium">
                          {card.order}. {card.title}
                        </p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {card.cardType}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Link
                          href={`/dashboard/seo/admin/cards/${card.id}/edit`}
                        >
                          <Button variant="outline" size="sm">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Link>
                        <DeleteCardButton cardId={card.id} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}

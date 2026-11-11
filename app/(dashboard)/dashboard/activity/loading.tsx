import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ActivityPageSkeleton() {
  return (
    <section className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8">
      <h1 className="text-lg lg:text-2xl font-medium text-foreground mb-6">
        Activity Log
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="min-h-[88px]" />
      </Card>
    </section>
  );
}

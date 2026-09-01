import type { WatchTitle } from "../domain/catalog/types";
import { Link, type Navigate } from "../components/Link";
import { MediaCard } from "../components/MediaCard";

export const homeQuickActions = [
  { href: "/cartoons", label: "Выбрать мультфильм", description: "Полный метр и короткие работы", className: "cartoons", icon: "✦" },
  { href: "/animated-series", label: "Выбрать мультсериал", description: "Эпизоды и сезоны", className: "animated-series", icon: "✺" },
  { href: "/movies", label: "Выбрать фильм", description: "Смотреть вместе и обсуждать", className: "movies", icon: "▶" },
  { href: "/series", label: "Выбрать сериал", description: "Игровые и познавательные", className: "series", icon: "▤" },
] as const;

export function HomePage({ titles, favorites, toggleFavorite, navigate }: { titles: WatchTitle[]; favorites: string[]; toggleFavorite: (id: string) => void; navigate: Navigate }) {
  return <div className="page home-page">
    <section className="hero">
      <div className="hero-copy">
        <div className="hero-brand"><img src="/nen-logo.png" alt="" /><span>киносервис</span></div>
        <p className="eyebrow">Семейный просмотр без бесконечного поиска</p>
        <h1>Что посмотреть <em>вместе</em></h1>
        <p className="lead">Подберите фильм, мультфильм или сериал по возрасту, интересам и настроению ребёнка — и найдите темы для разговора после просмотра.</p>
        <div className="hero-actions"><Link href="/cartoons" navigate={navigate} className="primary-link">Открыть каталог</Link><Link href="/recommend" navigate={navigate} className="secondary-link">Помочь с выбором</Link></div>
      </div>
      <aside className="hero-note"><span aria-hidden="true">▶</span><strong>Истории для общего вечера</strong><p>Возраст, важные темы и вопросы для разговора уже собраны в каждой карточке.</p></aside>
    </section>
    <section className="entry-grid" aria-label="Быстрый выбор формата">
      {homeQuickActions.map((action) => <Link key={action.href} href={action.href} navigate={navigate} className={`entry-card ${action.className}`}><span>{action.icon}</span><strong>{action.label}</strong><small>{action.description}</small></Link>)}
    </section>
    <section className="recommend-callout"><div><p className="eyebrow">Быстрый путь</p><h2>Не знаете, что выбрать?</h2><p>Начните с формата, а затем уточните выбор по возрасту, настроению и темам.</p></div><Link href="/recommend" navigate={navigate} className="primary-link">Подобрать произведение →</Link></section>
    <section><div className="section-heading"><div><p className="eyebrow">Редакционный выбор</p><h2>Небольшие подборки</h2></div><Link href="/collections" navigate={navigate} className="text-link">Все подборки →</Link></div><div className="collection-row"><Link href="/collections/semeinyi-vecher" navigate={navigate} className="collection-tile">Для семейного вечера</Link><Link href="/collections/uznat-novoe" navigate={navigate} className="collection-tile alt">Чтобы узнать новое</Link></div></section>
    <section><div className="section-heading"><div><p className="eyebrow">С чего начать</p><h2>Выбор редакции</h2></div></div><div className="media-grid">{titles.slice(0, 3).map((title) => <MediaCard key={title.id} title={title} favorite={favorites.includes(title.id)} toggleFavorite={toggleFavorite} navigate={navigate} />)}</div></section>
  </div>;
}

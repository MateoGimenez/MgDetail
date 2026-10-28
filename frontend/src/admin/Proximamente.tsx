/**
 * Lo que se ve en una sección registrada cuyo código todavía no existe (mientras se arma). Se reemplaza solo cuando
 * aparece el archivo de la sección: ver `secciones.ts`.
 */
export default function Proximamente({ titulo }: { titulo?: string }) {
  return (
    <section className="panel__vista" aria-labelledby="titulo-proximamente">
      <h1 id="titulo-proximamente" className="panel__titulo" tabIndex={-1}>
        {titulo ?? 'Próximamente'}
      </h1>
      <p className="panel__vacio">Esta sección todavía no está lista. Ya la estamos terminando.</p>
    </section>
  );
}

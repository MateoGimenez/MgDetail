import type { ReactNode } from 'react';
import { ETIQUETA_FRANJA, ETIQUETA_VEHICULO, FRANJAS, LIMITES, VEHICULO_TIPOS } from '../api/contract';
import { MarcoFilete, SubrayadoFilete } from '../components/Filete';
import { useCatalogo } from './catalogo-contexto';
import { CampoTexto, ErrorDeCampo } from './CampoTexto';
import { ExitoTurno } from './ExitoTurno';
import { ID_SECCION_RESERVA } from './reserva-contexto';
import { ResumenPedido } from './ResumenPedido';
import { SinTurnosOnline } from './SinTurnosOnline';
import { useFormularioTurno } from './useFormularioTurno';

function Grupo({ titulo, children, describedBy }: { titulo: string; children: ReactNode; describedBy?: string }) {
  return (
    <fieldset className="grupo" aria-describedby={describedBy}>
      <legend className="grupo__titulo">{titulo}</legend>
      {children}
    </fieldset>
  );
}

export function Reserva() {
  const {
    valores,
    setValores,
    errores,
    validarEnVivo,
    envio,
    rango,
    formRef,
    exitoRef,
    ids,
    radio,
    actualizar,
    alSalir,
    enviar,
    nuevoPedido,
  } = useFormularioTurno();
  const { servicios, estado } = useCatalogo();
  const describe = (campo: 'servicioId' | 'vehiculoTipo' | 'franja') => (errores[campo] ? ids.error(campo) : undefined);

  return (
    <section id={ID_SECCION_RESERVA} className="seccion reserva" aria-labelledby="reserva-titulo">
      <div className="contenedor">
        <header className="seccion__cabecera reserva__cabecera">
          <h2 id="reserva-titulo" className="seccion__titulo">
            Reservá tu turno
          </h2>
          {estado !== 'vacio' && (
            <p className="seccion__bajada">
              Elegí el servicio y el día que te queda bien. Te contactamos para confirmar el turno: lleva menos de un
              minuto.
            </p>
          )}
        </header>

        <div className="reserva__panel">
          <MarcoFilete tamano="mediano" trazar={envio.fase === 'exito'} key={envio.fase === 'exito' ? 'sello' : 'marco'} />

          {envio.fase === 'exito' ? (
            <ExitoTurno refTitulo={exitoRef} id={envio.id} datos={envio.datos} alPedirOtro={nuevoPedido} />
          ) : estado === 'vacio' ? (
            // Catálogo vacío: no hay servicios que reservar (el backend rechazaría cualquiera).
            <SinTurnosOnline />
          ) : (
            <form
              ref={formRef}
              className="reserva__form"
              noValidate
              onSubmit={(evento) => {
                evento.preventDefault();
                void enviar();
              }}
            >
              <div className="reserva__campos">
                <Grupo titulo="¿Qué servicio querés?" describedBy={describe('servicioId')}>
                  <div className="opciones-servicio">
                    {servicios.map((servicio) => (
                      <label key={servicio.id} className="opcion-servicio">
                        <input
                          className="opcion-servicio__input"
                          type="radio"
                          value={servicio.id}
                          checked={valores.servicioId === servicio.id}
                          onChange={() => {
                            actualizar('servicioId', servicio.id);
                          }}
                          {...radio('servicioId')}
                        />
                        <span className="opcion-servicio__nombre">
                          {servicio.nombre}
                          <SubrayadoFilete className="opcion-servicio__trazo" />
                        </span>
                        <span className="opcion-servicio__duracion">{servicio.duracion ?? ''}</span>
                      </label>
                    ))}
                  </div>
                  <ErrorDeCampo id={ids.error('servicioId')} mensaje={errores.servicioId} />
                </Grupo>

                <Grupo titulo="Tu vehículo" describedBy={describe('vehiculoTipo')}>
                  <div className="selector selector--3">
                    {VEHICULO_TIPOS.map((tipo) => (
                      <label key={tipo} className="selector__opcion">
                        <input
                          className="selector__input"
                          type="radio"
                          value={tipo}
                          checked={valores.vehiculoTipo === tipo}
                          onChange={() => {
                            actualizar('vehiculoTipo', tipo);
                          }}
                          {...radio('vehiculoTipo')}
                        />
                        <span className="selector__texto">{ETIQUETA_VEHICULO[tipo]}</span>
                        <SubrayadoFilete className="selector__trazo" />
                      </label>
                    ))}
                  </div>
                  <ErrorDeCampo id={ids.error('vehiculoTipo')} mensaje={errores.vehiculoTipo} />

                  <CampoTexto
                    id={ids.campo('vehiculoModelo')}
                    name="vehiculoModelo"
                    etiqueta="Marca y modelo"
                    opcional
                    error={errores.vehiculoModelo}
                    entrada={{
                      type: 'text',
                      autoComplete: 'off',
                      maxLength: LIMITES.vehiculoModelo.max,
                      placeholder: 'Ej.: Toyota Hilux 2018',
                      value: valores.vehiculoModelo,
                      onChange: (e) => {
                        actualizar('vehiculoModelo', e.target.value);
                      },
                      onBlur: () => {
                        alSalir('vehiculoModelo');
                      },
                    }}
                  />
                </Grupo>

                <Grupo titulo="¿Cuándo te queda bien?">
                  <div className="reserva__cuando">
                    <CampoTexto
                      id={ids.campo('fechaPreferida')}
                      name="fechaPreferida"
                      etiqueta="Día"
                      ayuda="Desde hoy y hasta 60 días adelante."
                      error={errores.fechaPreferida}
                      entrada={{
                        type: 'date',
                        min: rango.min,
                        max: rango.max,
                        value: valores.fechaPreferida,
                        onChange: (e) => {
                          actualizar('fechaPreferida', e.target.value);
                        },
                        onBlur: () => {
                          alSalir('fechaPreferida');
                        },
                      }}
                    />

                    <fieldset className="campo selector-franja" aria-describedby={describe('franja')}>
                      <legend className="campo__etiqueta">Horario</legend>
                      <div className="selector selector--2">
                        {FRANJAS.map((franja) => (
                          <label key={franja} className="selector__opcion">
                            <input
                              className="selector__input"
                              type="radio"
                              value={franja}
                              checked={valores.franja === franja}
                              onChange={() => {
                                actualizar('franja', franja);
                              }}
                              {...radio('franja')}
                            />
                            <span className="selector__texto">{ETIQUETA_FRANJA[franja]}</span>
                            <SubrayadoFilete className="selector__trazo" />
                          </label>
                        ))}
                      </div>
                      <ErrorDeCampo id={ids.error('franja')} mensaje={errores.franja} />
                    </fieldset>
                  </div>
                </Grupo>

                <Grupo titulo="Tus datos">
                  <div className="reserva__datos">
                    <CampoTexto
                      id={ids.campo('nombre')}
                      name="nombre"
                      etiqueta="Nombre y apellido"
                      error={errores.nombre}
                      entrada={{
                        type: 'text',
                        autoComplete: 'name',
                        inputMode: 'text',
                        autoCapitalize: 'words',
                        maxLength: LIMITES.nombre.max,
                        value: valores.nombre,
                        onChange: (e) => {
                          actualizar('nombre', e.target.value);
                        },
                        onBlur: () => {
                          alSalir('nombre');
                        },
                      }}
                    />
                    <CampoTexto
                      id={ids.campo('telefono')}
                      name="telefono"
                      etiqueta="Teléfono o WhatsApp"
                      ayuda="Con código de área. Te escribimos para confirmar."
                      error={errores.telefono}
                      entrada={{
                        type: 'tel',
                        autoComplete: 'tel',
                        inputMode: 'tel',
                        maxLength: LIMITES.telefono.max,
                        placeholder: 'Ej.: 380 412 3456',
                        value: valores.telefono,
                        onChange: (e) => {
                          actualizar('telefono', e.target.value);
                        },
                        onBlur: () => {
                          alSalir('telefono');
                        },
                      }}
                    />
                    <CampoTexto
                      id={ids.campo('email')}
                      name="email"
                      etiqueta="Email"
                      opcional
                      className="reserva__email"
                      error={errores.email}
                      entrada={{
                        type: 'email',
                        autoComplete: 'email',
                        inputMode: 'email',
                        autoCapitalize: 'none',
                        spellCheck: false,
                        maxLength: LIMITES.email.max,
                        value: valores.email,
                        onChange: (e) => {
                          actualizar('email', e.target.value);
                        },
                        onBlur: () => {
                          alSalir('email');
                        },
                      }}
                    />
                  </div>
                </Grupo>

                <CampoTexto
                  id={ids.campo('comentario')}
                  name="comentario"
                  etiqueta="¿Algo que tengamos que saber?"
                  opcional
                  ayuda={`${String(valores.comentario.length)} / ${String(LIMITES.comentario.max)}`}
                  error={errores.comentario}
                  texto={{
                    rows: 4,
                    maxLength: LIMITES.comentario.max,
                    placeholder: 'Ej.: tiene una raya en la puerta del acompañante',
                    value: valores.comentario,
                    onChange: (e) => {
                      actualizar('comentario', e.target.value);
                    },
                    onBlur: () => {
                      alSalir('comentario');
                    },
                  }}
                />

                {/* Trampa para bots: fuera de pantalla, fuera del orden de tabulación y oculta a lectores. */}
                <div className="trampa" aria-hidden="true">
                  <label htmlFor={ids.campo('website')}>Sitio web (no completar)</label>
                  <input
                    id={ids.campo('website')}
                    name="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={valores.website}
                    onChange={(evento) => {
                      setValores((actuales) => ({ ...actuales, website: evento.target.value }));
                    }}
                  />
                </div>
              </div>

              <ResumenPedido valores={valores} errores={errores} validarEnVivo={validarEnVivo} envio={envio} />
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

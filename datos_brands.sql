-- --------------------------------------------------------
-- Host:                         C:\GarperLux\backend\database\garperlux.sqlite
-- Versión del servidor:         3.39.4
-- SO del servidor:              
-- HeidiSQL Versión:             12.5.0.6679
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES  */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

-- Volcando datos para la tabla garperlux.brands: 75 rows
/*!40000 ALTER TABLE "brands" DISABLE KEYS */;
INSERT INTO "brands" ("id", "slug", "name", "professional", "logo", "description", "country", "year_founded", "website", "categories_json", "is_official") VALUES
	(1, 'simon', 'Simon', 1, '/assets/img/marcas/simon.jpg', 'Fabricante español de mecanismos eléctricos. Series 27, 75, 82 y 100. La gama 27 sigue siendo la más vendida desde 1986.', 'España', '1916', 'https://www.simonelectric.com', '["Mecanismos"]', 1),
	(3, 'schneider', 'Schneider Electric', 1, '/assets/img/marcas/schneider.jpg', 'Multinacional francesa especializada en gestión energética and automatización. Protecciones Acti9 and Resi9, domótica Wiser.', 'Francia', '1836', 'https://www.se.com/es', '["Mecanismos","Protecciones eléctricas"]', 1),
	(4, 'garperlux', 'GarperLux', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(5, 'lexman', 'Lexman', 1, '/assets/img/marcas/lexman.jpg', 'Marca de iluminación LED de gama media-alta distribuida en grandes superficies. Bombillas, plafones, tiras LED and proyectores con buena relación calidad-precio.', 'Francia', '2003', 'https://www.leroymerlin.es/marcas/lexman', '["Iluminación"]', 0),
	(6, 'brico-fontini', 'BRICO FONTINI', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(7, 'legrand', 'Legrand', 1, '/assets/img/marcas/legrand.jpg', 'Grupo francés de infraestructura eléctrica. Cuadros modulares, protecciones, mecanismos Valena and Niloé, gestión de cables.', 'Francia', '1865', 'https://www.legrand.es', '["Protecciones eléctricas"]', 1),
	(8, 'schneider-electric', 'SCHNEIDER ELECTRIC', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(9, 'byimtek', 'BYIMTEK', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(10, 'abb', 'ABB', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(11, 'niessen', 'Niessen', 1, '/assets/img/marcas/niessen.jpg', 'Mecanismos premium con acabados de diseño. Series Sky, Zenit and Tacto. Marca histórica de Oiartzun, ahora parte de ABB.', 'España', '1929', 'https://new.abb.com/niessen', '["Mecanismos"]', 0),
	(12, 'philips', 'Philips', 1, '/assets/img/marcas/philips.jpg', 'División de iluminación (ahora Signify). Bombillas LED, luminarias profesionales and sistema domótico Philips Hue.', 'Países Bajos', '1891', 'https://www.signify.com', '["Iluminación","Domótica"]', 0),
	(13, 'muvit', 'MUVIT', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(14, 'osram', 'Osram', 1, '/assets/img/marcas/osram.jpg', 'Multinacional alemana de iluminación. Bombillas LED, tubos fluorescentes, drivers and soluciones de iluminación profesional e industrial.', 'Alemania', '1919', 'https://www.osram.com', '["Iluminación"]', 0),
	(15, 'xanlite', 'XANLITE', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(16, 'chint', 'Chint', 1, '/assets/img/marcas/chint.jpg', 'Multinacional especializada en material eléctrico industrial. Magnetotérmicos, diferenciales, contactores and protecciones de baja tensión.', 'China', '1984', 'https://www.chint.com', '["Protecciones eléctricas"]', 0),
	(17, 'hager', 'Hager', 1, '/assets/img/marcas/hager.jpg', 'Cuadros modulares de gama profesional, telerruptores, magnetotérmicos and diferenciales tipo F. Referente en distribución de energía.', 'Alemania', '1955', 'https://www.hager.es', '["Mecanismos","Protecciones eléctricas"]', 1),
	(18, 'toscano', 'TOSCANO', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(19, 'famatel', 'FAMATEL', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(20, 'ceese', 'CEESE', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(21, 'ezviz', 'EZVIZ', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(22, 'fermax', 'Fermax', 1, '/assets/img/marcas/fermax.jpg', 'Fabricante valenciano de videoporteros, porteros automáticos and control de accesos. Referencia en el sector residencial.', 'España', '1949', 'https://www.fermax.com', '["Porteros y videoporteros"]', 1),
	(23, 'scs-sentinel', 'SCS SENTINEL', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(24, 'dio', 'DIO', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(25, 'shelly', 'Shelly', 1, '/assets/img/marcas/shelly.png', 'Domótica Wi-Fi sin nube obligatoria. Relés, módulos de control and sensores. El estándar de facto para automatización en vivienda existente.', 'Bulgaria', '2017', 'https://www.shelly.com', '["Domótica"]', 1),
	(26, 'sonoff', 'SONOFF', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(27, 'energeeks', 'ENERGEEKS', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(28, 'came', 'Came', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(29, 'faac', 'Faac', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(30, 'nice', 'Nice', 1, '/assets/img/marcas/nice.png', 'Multinacional italiana de automatización de puertas, persianas and control de accesos. Motores para garaje, correderas and batientes.', 'Italia', '1993', 'https://www.niceforyou.com', '["Automatismos"]', 0),
	(31, 'somfy', 'Somfy', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(32, 'erreka', 'Erreka', 1, '/assets/img/marcas/erreka.jpg', 'Empresa vasca especializada en automatismos para puertas and accesos. Motores de puertas correderas, batientes and garaje.', 'España', NULL, 'https://www.erreka.com', '["Automatismos"]', 0),
	(33, 'bft', 'BFT', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(34, 'roper', 'Roper', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(35, 'televes', 'Televes', 1, '/assets/img/marcas/televes.jpg', 'Empresa gallega líder en telecomunicaciones. Antenas de TV, distribución de señal, fibra óptica and equipamiento de cabecera.', 'España', '1958', 'https://www.televes.com', '["Antenas y telecomunicaciones"]', 0),
	(36, 'engel', 'Engel', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(37, 'ikusi', 'Ikusi', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(38, 'tp-link', 'TP-Link', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(39, 'mikrotik', 'Mikrotik', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(40, 'ubiquiti', 'Ubiquiti', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(41, 'hikvision', 'Hikvision', 1, '/assets/img/marcas/hikvision.jpg', 'Líder mundial en videovigilancia. Cámaras IP, grabadores NVR/DVR and sistemas de seguridad profesional.', 'China', '2001', 'https://www.hikvision.com', '["Seguridad"]', 0),
	(42, 'reolink', 'Reolink', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(43, 'ajax', 'Ajax', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(44, 'dahua', 'Dahua', 1, '/assets/img/marcas/dahua.jpg', 'Soluciones de videovigilancia and seguridad. Cámaras IP, grabadores, intercomunicadores and control de accesos.', 'China', '2001', 'https://www.dahuasecurity.com', '["Seguridad"]', 0),
	(45, 'verisure', 'Verisure', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(46, 'prysmian', 'Prysmian', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(47, 'general-cable', 'General Cable', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(48, 'top-cable', 'Top Cable', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(49, 'bjc', 'BJC', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(50, 'cristal-record', 'CRISTAL RECORD', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(51, 'inspire', 'INSPIRE', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(52, 'greenice', 'GREENICE', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(53, 'forlight', 'FORLIGHT', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(54, 'mantra', 'MANTRA', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(55, 'ksix', 'KSIX', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(56, 'nettlife', 'NETTLIFE', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(57, 'barcelona-led', 'BARCELONA LED', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(58, 'emuca', 'EMUCA', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(59, 'nivian', 'NIVIAN', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(60, 'imou', 'IMOU', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(61, 'garza', 'GARZA', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(62, 'roma-regal', 'ROMA REGAL', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(63, 'comely', 'COMELY', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(64, 'sontomo', 'SONTOMO', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(65, 'dimoel', 'DIMOEL', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(66, 'matismo', 'MATISMO', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(67, 'mercusys', 'MERCUSYS', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(68, 'eufy', 'EUFY', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(69, 'chacon', 'CHACON', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(70, 'lollanda', 'LOLLANDA', 0, NULL, NULL, NULL, NULL, NULL, '[]', 0),
	(79, 'tegui', 'Tegui', 1, '/assets/img/marcas/tegui.jpg', 'Marca española especializada en porteros and videoporteros para comunidades and viviendas unifamiliares. Ahora parte de Legrand.', 'España', NULL, 'https://www.legrand.es', '["Porteros y videoporteros"]', 0),
	(83, 'pujol-muntala', 'Pujol Muntalá', 1, '/assets/img/marcas/pujol.jpg', 'Fabricante español de automatismos para puertas and persianas. Motores tubulares, centrales de maniobra and accesorios.', 'España', NULL, 'https://www.pujol.com', '["Automatismos"]', 0),
	(84, 'clemsa', 'Clemsa', 1, '/assets/img/marcas/clemsa.png', 'Empresa española especializada en automatismos para puertas de garaje, mandos a distancia and control de accesos.', 'España', '1961', 'https://www.clemsa.es', '["Automatismos"]', 0),
	(87, 'tapo', 'Tapo', 1, '/assets/img/marcas/tapo.png', 'Marca de TP-Link enfocada en seguridad doméstica and domótica asequible. Cámaras Wi-Fi, enchufes inteligentes and bombillas smart.', 'China', NULL, 'https://www.tapo.com', '["Seguridad"]', 0),
	(89, 'matel', 'Matel', 1, '/assets/img/marcas/matel.jpg', 'Fabricante español de iluminación LED and material eléctrico. Bombillas, downlights, plafones and proyectores LED con amplio catálogo.', 'España', NULL, 'https://www.matelelectro.com', '["Iluminación"]', 0),
	(90, 'lighted', 'LightEd', 1, '/assets/img/marcas/lighted.webp', 'Marca española de iluminación LED profesional. Bombillas, tubos, paneles and proyectores con relación calidad-precio orientada al instalador.', 'España', NULL, 'https://www.lighted.es', '["Iluminación"]', 0);
/*!40000 ALTER TABLE "brands" ENABLE KEYS */;

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;

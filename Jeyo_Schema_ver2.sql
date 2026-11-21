--
-- PostgreSQL database dump
--

\restrict sHbxddBY9UN8CawYTDOPpy8gH99tyOHvoRQHMcaFro5VjSvT6eN52ZHcZodnxCK

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

-- Started on 2026-11-21 12:20:00

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 6 (class 2615 OID 57415)
-- Name: jeyo_schema; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA jeyo_schema;


ALTER SCHEMA jeyo_schema OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 231 (class 1259 OID 65640)
-- Name: check_in; Type: TABLE; Schema: jeyo_schema; Owner: postgres
--

CREATE TABLE jeyo_schema.check_in (
    checkin_id integer NOT NULL,
    member_id integer NOT NULL,
    checked_at timestamp with time zone DEFAULT now() NOT NULL,
    result character varying(10) NOT NULL,
    staff_id integer,
    CONSTRAINT check_in_result_check CHECK (((result)::text = ANY ((ARRAY['approved'::character varying, 'expired'::character varying, 'duplicate'::character varying])::text[])))
);


ALTER TABLE jeyo_schema.check_in OWNER TO postgres;

--
-- TOC entry 230 (class 1259 OID 65639)
-- Name: check_in_checkin_id_seq; Type: SEQUENCE; Schema: jeyo_schema; Owner: postgres
--

CREATE SEQUENCE jeyo_schema.check_in_checkin_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE jeyo_schema.check_in_checkin_id_seq OWNER TO postgres;

--
-- TOC entry 5053 (class 0 OID 0)
-- Dependencies: 230
-- Name: check_in_checkin_id_seq; Type: SEQUENCE OWNED BY; Schema: jeyo_schema; Owner: postgres
--

ALTER SEQUENCE jeyo_schema.check_in_checkin_id_seq OWNED BY jeyo_schema.check_in.checkin_id;


--
-- TOC entry 241 (class 1259 OID 65768)
-- Name: coaching_enrollment; Type: TABLE; Schema: jeyo_schema; Owner: postgres
--

CREATE TABLE jeyo_schema.coaching_enrollment (
    enrollment_id integer NOT NULL,
    member_id integer NOT NULL,
    coach_id integer NOT NULL,
    package_id integer NOT NULL,
    sessions_remaining integer NOT NULL,
    start_date date DEFAULT CURRENT_DATE NOT NULL,
    expire_date date NOT NULL,
    status character varying(10) DEFAULT 'active'::character varying NOT NULL,
    CONSTRAINT coaching_enrollment_sessions_remaining_check CHECK ((sessions_remaining >= 0)),
    CONSTRAINT coaching_enrollment_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'completed'::character varying, 'expired'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE jeyo_schema.coaching_enrollment OWNER TO postgres;

--
-- TOC entry 240 (class 1259 OID 65767)
-- Name: coaching_enrollment_enrollment_id_seq; Type: SEQUENCE; Schema: jeyo_schema; Owner: postgres
--

CREATE SEQUENCE jeyo_schema.coaching_enrollment_enrollment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE jeyo_schema.coaching_enrollment_enrollment_id_seq OWNER TO postgres;

--
-- TOC entry 5054 (class 0 OID 0)
-- Dependencies: 240
-- Name: coaching_enrollment_enrollment_id_seq; Type: SEQUENCE OWNED BY; Schema: jeyo_schema; Owner: postgres
--

ALTER SEQUENCE jeyo_schema.coaching_enrollment_enrollment_id_seq OWNED BY jeyo_schema.coaching_enrollment.enrollment_id;


--
-- TOC entry 239 (class 1259 OID 65753)
-- Name: coaching_package; Type: TABLE; Schema: jeyo_schema; Owner: postgres
--

CREATE TABLE jeyo_schema.coaching_package (
    package_id integer NOT NULL,
    package_name character varying(50) NOT NULL,
    sessions_included integer NOT NULL,
    price numeric(10,2) NOT NULL,
    validity_days integer NOT NULL,
    CONSTRAINT coaching_package_sessions_included_check CHECK ((sessions_included > 0))
);


ALTER TABLE jeyo_schema.coaching_package OWNER TO postgres;

--
-- TOC entry 238 (class 1259 OID 65752)
-- Name: coaching_package_package_id_seq; Type: SEQUENCE; Schema: jeyo_schema; Owner: postgres
--

CREATE SEQUENCE jeyo_schema.coaching_package_package_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE jeyo_schema.coaching_package_package_id_seq OWNER TO postgres;

--
-- TOC entry 5055 (class 0 OID 0)
-- Dependencies: 238
-- Name: coaching_package_package_id_seq; Type: SEQUENCE OWNED BY; Schema: jeyo_schema; Owner: postgres
--

ALTER SEQUENCE jeyo_schema.coaching_package_package_id_seq OWNED BY jeyo_schema.coaching_package.package_id;


--
-- TOC entry 243 (class 1259 OID 65802)
-- Name: coaching_session; Type: TABLE; Schema: jeyo_schema; Owner: postgres
--

CREATE TABLE jeyo_schema.coaching_session (
    session_id integer NOT NULL,
    enrollment_id integer NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    status character varying(10) DEFAULT 'scheduled'::character varying NOT NULL,
    notes character varying(200),
    CONSTRAINT coaching_session_status_check CHECK (((status)::text = ANY ((ARRAY['scheduled'::character varying, 'completed'::character varying, 'cancelled'::character varying, 'no_show'::character varying])::text[])))
);


ALTER TABLE jeyo_schema.coaching_session OWNER TO postgres;

--
-- TOC entry 242 (class 1259 OID 65801)
-- Name: coaching_session_session_id_seq; Type: SEQUENCE; Schema: jeyo_schema; Owner: postgres
--

CREATE SEQUENCE jeyo_schema.coaching_session_session_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE jeyo_schema.coaching_session_session_id_seq OWNER TO postgres;

--
-- TOC entry 5056 (class 0 OID 0)
-- Dependencies: 242
-- Name: coaching_session_session_id_seq; Type: SEQUENCE OWNED BY; Schema: jeyo_schema; Owner: postgres
--

ALTER SEQUENCE jeyo_schema.coaching_session_session_id_seq OWNED BY jeyo_schema.coaching_session.session_id;


--
-- TOC entry 221 (class 1259 OID 57417)
-- Name: members; Type: TABLE; Schema: jeyo_schema; Owner: postgres
--

CREATE TABLE jeyo_schema.members (
    member_id integer NOT NULL,
    member_name character varying(50),
    member_number character varying(15),
    mem_expire_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    staff_id integer,
    member_code character varying(10) GENERATED ALWAYS AS (('HH-'::text || lpad((member_id)::text, 5, '0'::text))) STORED,
    email character varying(100),
    password_hash character varying(100),
    qr_value character varying(100) DEFAULT (gen_random_uuid())::text,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    plan_id integer
);


ALTER TABLE jeyo_schema.members OWNER TO postgres;

--
-- TOC entry 220 (class 1259 OID 57416)
-- Name: members_member_id_seq; Type: SEQUENCE; Schema: jeyo_schema; Owner: postgres
--

CREATE SEQUENCE jeyo_schema.members_member_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE jeyo_schema.members_member_id_seq OWNER TO postgres;

--
-- TOC entry 5057 (class 0 OID 0)
-- Dependencies: 220
-- Name: members_member_id_seq; Type: SEQUENCE OWNED BY; Schema: jeyo_schema; Owner: postgres
--

ALTER SEQUENCE jeyo_schema.members_member_id_seq OWNED BY jeyo_schema.members.member_id;


--
-- TOC entry 233 (class 1259 OID 65663)
-- Name: payment; Type: TABLE; Schema: jeyo_schema; Owner: postgres
--

CREATE TABLE jeyo_schema.payment (
    payment_id integer NOT NULL,
    reference_no character varying(12) NOT NULL,
    member_id integer NOT NULL,
    plan_id integer,
    amount numeric(10,2) NOT NULL,
    method character varying(15) NOT NULL,
    status character varying(10) DEFAULT 'paid'::character varying NOT NULL,
    paid_at timestamp with time zone DEFAULT now() NOT NULL,
    staff_id integer,
    enrollment_id integer,
    CONSTRAINT payment_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT payment_method_check CHECK (((method)::text = ANY ((ARRAY['Cash'::character varying, 'GCash'::character varying, 'Bank transfer'::character varying])::text[]))),
    CONSTRAINT payment_status_check CHECK (((status)::text = ANY ((ARRAY['paid'::character varying, 'pending'::character varying, 'review'::character varying])::text[])))
);


ALTER TABLE jeyo_schema.payment OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 65662)
-- Name: payment_payment_id_seq; Type: SEQUENCE; Schema: jeyo_schema; Owner: postgres
--

CREATE SEQUENCE jeyo_schema.payment_payment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE jeyo_schema.payment_payment_id_seq OWNER TO postgres;

--
-- TOC entry 5058 (class 0 OID 0)
-- Dependencies: 232
-- Name: payment_payment_id_seq; Type: SEQUENCE OWNED BY; Schema: jeyo_schema; Owner: postgres
--

ALTER SEQUENCE jeyo_schema.payment_payment_id_seq OWNED BY jeyo_schema.payment.payment_id;


--
-- TOC entry 229 (class 1259 OID 65627)
-- Name: plan; Type: TABLE; Schema: jeyo_schema; Owner: postgres
--

CREATE TABLE jeyo_schema.plan (
    plan_id integer NOT NULL,
    plan_name character varying(30) NOT NULL,
    price numeric(10,2) NOT NULL,
    duration_days integer NOT NULL
);


ALTER TABLE jeyo_schema.plan OWNER TO postgres;

--
-- TOC entry 228 (class 1259 OID 65626)
-- Name: plan_plan_id_seq; Type: SEQUENCE; Schema: jeyo_schema; Owner: postgres
--

CREATE SEQUENCE jeyo_schema.plan_plan_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE jeyo_schema.plan_plan_id_seq OWNER TO postgres;

--
-- TOC entry 5059 (class 0 OID 0)
-- Dependencies: 228
-- Name: plan_plan_id_seq; Type: SEQUENCE OWNED BY; Schema: jeyo_schema; Owner: postgres
--

ALTER SEQUENCE jeyo_schema.plan_plan_id_seq OWNED BY jeyo_schema.plan.plan_id;


--
-- TOC entry 225 (class 1259 OID 57439)
-- Name: product; Type: TABLE; Schema: jeyo_schema; Owner: postgres
--

CREATE TABLE jeyo_schema.product (
    product_id integer NOT NULL,
    product_name character varying(50),
    product_stock integer,
    staff_id integer,
    sku character varying(15),
    category character varying(20),
    reorder_level integer DEFAULT 0 NOT NULL,
    unit_cost numeric(10,2),
    unit_price numeric(10,2),
    CONSTRAINT product_category_check CHECK (((category)::text = ANY ((ARRAY['retail'::character varying, 'accessory'::character varying, 'supply'::character varying])::text[])))
);


ALTER TABLE jeyo_schema.product OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 57438)
-- Name: product_product_id_seq; Type: SEQUENCE; Schema: jeyo_schema; Owner: postgres
--

CREATE SEQUENCE jeyo_schema.product_product_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE jeyo_schema.product_product_id_seq OWNER TO postgres;

--
-- TOC entry 5060 (class 0 OID 0)
-- Dependencies: 224
-- Name: product_product_id_seq; Type: SEQUENCE OWNED BY; Schema: jeyo_schema; Owner: postgres
--

ALTER SEQUENCE jeyo_schema.product_product_id_seq OWNED BY jeyo_schema.product.product_id;


--
-- TOC entry 237 (class 1259 OID 65723)
-- Name: product_sale; Type: TABLE; Schema: jeyo_schema; Owner: postgres
--

CREATE TABLE jeyo_schema.product_sale (
    sale_id integer NOT NULL,
    product_id integer NOT NULL,
    quantity integer NOT NULL,
    total numeric(10,2) NOT NULL,
    sold_at timestamp with time zone DEFAULT now() NOT NULL,
    staff_id integer,
    CONSTRAINT product_sale_quantity_check CHECK ((quantity > 0))
);


ALTER TABLE jeyo_schema.product_sale OWNER TO postgres;

--
-- TOC entry 236 (class 1259 OID 65722)
-- Name: product_sale_sale_id_seq; Type: SEQUENCE; Schema: jeyo_schema; Owner: postgres
--

CREATE SEQUENCE jeyo_schema.product_sale_sale_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE jeyo_schema.product_sale_sale_id_seq OWNER TO postgres;

--
-- TOC entry 5061 (class 0 OID 0)
-- Dependencies: 236
-- Name: product_sale_sale_id_seq; Type: SEQUENCE OWNED BY; Schema: jeyo_schema; Owner: postgres
--

ALTER SEQUENCE jeyo_schema.product_sale_sale_id_seq OWNED BY jeyo_schema.product_sale.sale_id;


--
-- TOC entry 227 (class 1259 OID 57452)
-- Name: protein_powder; Type: TABLE; Schema: jeyo_schema; Owner: postgres
--

CREATE TABLE jeyo_schema.protein_powder (
    protein_id integer NOT NULL,
    protein_name character varying(50),
    add_ons character varying(50),
    product_id integer
);


ALTER TABLE jeyo_schema.protein_powder OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 57451)
-- Name: protein_powder_protein_id_seq; Type: SEQUENCE; Schema: jeyo_schema; Owner: postgres
--

CREATE SEQUENCE jeyo_schema.protein_powder_protein_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE jeyo_schema.protein_powder_protein_id_seq OWNER TO postgres;

--
-- TOC entry 5062 (class 0 OID 0)
-- Dependencies: 226
-- Name: protein_powder_protein_id_seq; Type: SEQUENCE OWNED BY; Schema: jeyo_schema; Owner: postgres
--

ALTER SEQUENCE jeyo_schema.protein_powder_protein_id_seq OWNED BY jeyo_schema.protein_powder.protein_id;


--
-- TOC entry 223 (class 1259 OID 57426)
-- Name: staff; Type: TABLE; Schema: jeyo_schema; Owner: postgres
--

CREATE TABLE jeyo_schema.staff (
    staff_id integer NOT NULL,
    staff_name character varying(50),
    staff_number character varying(11),
    email character varying(100),
    password_hash character varying(100),
    role character varying(100),
    created_at date DEFAULT CURRENT_DATE CONSTRAINT staff_created_not_null NOT NULL,
    CONSTRAINT staff_role_check CHECK (((role)::text = ANY ((ARRAY['owner'::character varying, 'staff'::character varying, 'coach'::character varying])::text[])))
);


ALTER TABLE jeyo_schema.staff OWNER TO postgres;

--
-- TOC entry 222 (class 1259 OID 57425)
-- Name: staff_staff_id_seq; Type: SEQUENCE; Schema: jeyo_schema; Owner: postgres
--

CREATE SEQUENCE jeyo_schema.staff_staff_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE jeyo_schema.staff_staff_id_seq OWNER TO postgres;

--
-- TOC entry 5063 (class 0 OID 0)
-- Dependencies: 222
-- Name: staff_staff_id_seq; Type: SEQUENCE OWNED BY; Schema: jeyo_schema; Owner: postgres
--

ALTER SEQUENCE jeyo_schema.staff_staff_id_seq OWNED BY jeyo_schema.staff.staff_id;


--
-- TOC entry 235 (class 1259 OID 65699)
-- Name: stock_movement; Type: TABLE; Schema: jeyo_schema; Owner: postgres
--

CREATE TABLE jeyo_schema.stock_movement (
    movement_id integer NOT NULL,
    product_id integer NOT NULL,
    qty_change integer NOT NULL,
    reason character varying(15) NOT NULL,
    note character varying(100),
    moved_at timestamp with time zone DEFAULT now() NOT NULL,
    staff_id integer,
    CONSTRAINT stock_movement_reason_check CHECK (((reason)::text = ANY ((ARRAY['delivery'::character varying, 'sale'::character varying, 'correction'::character varying])::text[])))
);


ALTER TABLE jeyo_schema.stock_movement OWNER TO postgres;

--
-- TOC entry 234 (class 1259 OID 65698)
-- Name: stock_movement_movement_id_seq; Type: SEQUENCE; Schema: jeyo_schema; Owner: postgres
--

CREATE SEQUENCE jeyo_schema.stock_movement_movement_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE jeyo_schema.stock_movement_movement_id_seq OWNER TO postgres;

--
-- TOC entry 5064 (class 0 OID 0)
-- Dependencies: 234
-- Name: stock_movement_movement_id_seq; Type: SEQUENCE OWNED BY; Schema: jeyo_schema; Owner: postgres
--

ALTER SEQUENCE jeyo_schema.stock_movement_movement_id_seq OWNED BY jeyo_schema.stock_movement.movement_id;


--
-- TOC entry 4822 (class 2604 OID 65643)
-- Name: check_in checkin_id; Type: DEFAULT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.check_in ALTER COLUMN checkin_id SET DEFAULT nextval('jeyo_schema.check_in_checkin_id_seq'::regclass);


--
-- TOC entry 4832 (class 2604 OID 65771)
-- Name: coaching_enrollment enrollment_id; Type: DEFAULT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.coaching_enrollment ALTER COLUMN enrollment_id SET DEFAULT nextval('jeyo_schema.coaching_enrollment_enrollment_id_seq'::regclass);


--
-- TOC entry 4831 (class 2604 OID 65756)
-- Name: coaching_package package_id; Type: DEFAULT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.coaching_package ALTER COLUMN package_id SET DEFAULT nextval('jeyo_schema.coaching_package_package_id_seq'::regclass);


--
-- TOC entry 4835 (class 2604 OID 65805)
-- Name: coaching_session session_id; Type: DEFAULT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.coaching_session ALTER COLUMN session_id SET DEFAULT nextval('jeyo_schema.coaching_session_session_id_seq'::regclass);


--
-- TOC entry 4811 (class 2604 OID 57420)
-- Name: members member_id; Type: DEFAULT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.members ALTER COLUMN member_id SET DEFAULT nextval('jeyo_schema.members_member_id_seq'::regclass);


--
-- TOC entry 4824 (class 2604 OID 65666)
-- Name: payment payment_id; Type: DEFAULT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.payment ALTER COLUMN payment_id SET DEFAULT nextval('jeyo_schema.payment_payment_id_seq'::regclass);


--
-- TOC entry 4821 (class 2604 OID 65630)
-- Name: plan plan_id; Type: DEFAULT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.plan ALTER COLUMN plan_id SET DEFAULT nextval('jeyo_schema.plan_plan_id_seq'::regclass);


--
-- TOC entry 4818 (class 2604 OID 57442)
-- Name: product product_id; Type: DEFAULT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.product ALTER COLUMN product_id SET DEFAULT nextval('jeyo_schema.product_product_id_seq'::regclass);


--
-- TOC entry 4829 (class 2604 OID 65726)
-- Name: product_sale sale_id; Type: DEFAULT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.product_sale ALTER COLUMN sale_id SET DEFAULT nextval('jeyo_schema.product_sale_sale_id_seq'::regclass);


--
-- TOC entry 4820 (class 2604 OID 57455)
-- Name: protein_powder protein_id; Type: DEFAULT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.protein_powder ALTER COLUMN protein_id SET DEFAULT nextval('jeyo_schema.protein_powder_protein_id_seq'::regclass);


--
-- TOC entry 4816 (class 2604 OID 57429)
-- Name: staff staff_id; Type: DEFAULT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.staff ALTER COLUMN staff_id SET DEFAULT nextval('jeyo_schema.staff_staff_id_seq'::regclass);


--
-- TOC entry 4827 (class 2604 OID 65702)
-- Name: stock_movement movement_id; Type: DEFAULT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.stock_movement ALTER COLUMN movement_id SET DEFAULT nextval('jeyo_schema.stock_movement_movement_id_seq'::regclass);


--
-- TOC entry 4866 (class 2606 OID 65651)
-- Name: check_in check_in_pkey; Type: CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.check_in
    ADD CONSTRAINT check_in_pkey PRIMARY KEY (checkin_id);


--
-- TOC entry 4880 (class 2606 OID 65785)
-- Name: coaching_enrollment coaching_enrollment_pkey; Type: CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.coaching_enrollment
    ADD CONSTRAINT coaching_enrollment_pkey PRIMARY KEY (enrollment_id);


--
-- TOC entry 4876 (class 2606 OID 65766)
-- Name: coaching_package coaching_package_package_name_key; Type: CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.coaching_package
    ADD CONSTRAINT coaching_package_package_name_key UNIQUE (package_name);


--
-- TOC entry 4878 (class 2606 OID 65764)
-- Name: coaching_package coaching_package_pkey; Type: CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.coaching_package
    ADD CONSTRAINT coaching_package_pkey PRIMARY KEY (package_id);


--
-- TOC entry 4882 (class 2606 OID 65813)
-- Name: coaching_session coaching_session_pkey; Type: CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.coaching_session
    ADD CONSTRAINT coaching_session_pkey PRIMARY KEY (session_id);


--
-- TOC entry 4850 (class 2606 OID 57424)
-- Name: members members_pkey; Type: CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (member_id);


--
-- TOC entry 4852 (class 2606 OID 65613)
-- Name: members members_qr_value_key; Type: CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.members
    ADD CONSTRAINT members_qr_value_key UNIQUE (qr_value);


--
-- TOC entry 4868 (class 2606 OID 65680)
-- Name: payment payment_pkey; Type: CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.payment
    ADD CONSTRAINT payment_pkey PRIMARY KEY (payment_id);


--
-- TOC entry 4870 (class 2606 OID 65682)
-- Name: payment payment_reference_no_key; Type: CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.payment
    ADD CONSTRAINT payment_reference_no_key UNIQUE (reference_no);


--
-- TOC entry 4862 (class 2606 OID 65636)
-- Name: plan plan_pkey; Type: CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.plan
    ADD CONSTRAINT plan_pkey PRIMARY KEY (plan_id);


--
-- TOC entry 4864 (class 2606 OID 65638)
-- Name: plan plan_plan_name_key; Type: CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.plan
    ADD CONSTRAINT plan_plan_name_key UNIQUE (plan_name);


--
-- TOC entry 4856 (class 2606 OID 57445)
-- Name: product product_pkey; Type: CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.product
    ADD CONSTRAINT product_pkey PRIMARY KEY (product_id);


--
-- TOC entry 4874 (class 2606 OID 65735)
-- Name: product_sale product_sale_pkey; Type: CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.product_sale
    ADD CONSTRAINT product_sale_pkey PRIMARY KEY (sale_id);


--
-- TOC entry 4858 (class 2606 OID 65624)
-- Name: product product_sku_key; Type: CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.product
    ADD CONSTRAINT product_sku_key UNIQUE (sku);


--
-- TOC entry 4860 (class 2606 OID 57458)
-- Name: protein_powder protein_powder_pkey; Type: CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.protein_powder
    ADD CONSTRAINT protein_powder_pkey PRIMARY KEY (protein_id);


--
-- TOC entry 4854 (class 2606 OID 57432)
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (staff_id);


--
-- TOC entry 4872 (class 2606 OID 65711)
-- Name: stock_movement stock_movement_pkey; Type: CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.stock_movement
    ADD CONSTRAINT stock_movement_pkey PRIMARY KEY (movement_id);


--
-- TOC entry 4887 (class 2606 OID 65652)
-- Name: check_in check_in_member_id_fkey; Type: FK CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.check_in
    ADD CONSTRAINT check_in_member_id_fkey FOREIGN KEY (member_id) REFERENCES jeyo_schema.members(member_id);


--
-- TOC entry 4888 (class 2606 OID 65657)
-- Name: check_in check_in_staff_id_fkey; Type: FK CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.check_in
    ADD CONSTRAINT check_in_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES jeyo_schema.staff(staff_id);


--
-- TOC entry 4897 (class 2606 OID 65791)
-- Name: coaching_enrollment coaching_enrollment_coach_id_fkey; Type: FK CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.coaching_enrollment
    ADD CONSTRAINT coaching_enrollment_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES jeyo_schema.staff(staff_id);


--
-- TOC entry 4898 (class 2606 OID 65786)
-- Name: coaching_enrollment coaching_enrollment_member_id_fkey; Type: FK CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.coaching_enrollment
    ADD CONSTRAINT coaching_enrollment_member_id_fkey FOREIGN KEY (member_id) REFERENCES jeyo_schema.members(member_id);


--
-- TOC entry 4899 (class 2606 OID 65796)
-- Name: coaching_enrollment coaching_enrollment_package_id_fkey; Type: FK CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.coaching_enrollment
    ADD CONSTRAINT coaching_enrollment_package_id_fkey FOREIGN KEY (package_id) REFERENCES jeyo_schema.coaching_package(package_id);


--
-- TOC entry 4900 (class 2606 OID 65814)
-- Name: coaching_session coaching_session_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.coaching_session
    ADD CONSTRAINT coaching_session_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES jeyo_schema.coaching_enrollment(enrollment_id);


--
-- TOC entry 4886 (class 2606 OID 57459)
-- Name: protein_powder fk_product; Type: FK CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.protein_powder
    ADD CONSTRAINT fk_product FOREIGN KEY (product_id) REFERENCES jeyo_schema.product(product_id);


--
-- TOC entry 4883 (class 2606 OID 57433)
-- Name: members fk_staff; Type: FK CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.members
    ADD CONSTRAINT fk_staff FOREIGN KEY (staff_id) REFERENCES jeyo_schema.staff(staff_id);


--
-- TOC entry 4885 (class 2606 OID 57446)
-- Name: product fk_staff; Type: FK CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.product
    ADD CONSTRAINT fk_staff FOREIGN KEY (staff_id) REFERENCES jeyo_schema.staff(staff_id);


--
-- TOC entry 4884 (class 2606 OID 65746)
-- Name: members members_plan_id_fkey; Type: FK CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.members
    ADD CONSTRAINT members_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES jeyo_schema.plan(plan_id);


--
-- TOC entry 4889 (class 2606 OID 65819)
-- Name: payment payment_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.payment
    ADD CONSTRAINT payment_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES jeyo_schema.coaching_enrollment(enrollment_id);


--
-- TOC entry 4890 (class 2606 OID 65683)
-- Name: payment payment_member_id_fkey; Type: FK CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.payment
    ADD CONSTRAINT payment_member_id_fkey FOREIGN KEY (member_id) REFERENCES jeyo_schema.members(member_id);


--
-- TOC entry 4891 (class 2606 OID 65688)
-- Name: payment payment_plan_id_fkey; Type: FK CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.payment
    ADD CONSTRAINT payment_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES jeyo_schema.plan(plan_id);


--
-- TOC entry 4892 (class 2606 OID 65693)
-- Name: payment payment_staff_id_fkey; Type: FK CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.payment
    ADD CONSTRAINT payment_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES jeyo_schema.staff(staff_id);


--
-- TOC entry 4895 (class 2606 OID 65736)
-- Name: product_sale product_sale_product_id_fkey; Type: FK CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.product_sale
    ADD CONSTRAINT product_sale_product_id_fkey FOREIGN KEY (product_id) REFERENCES jeyo_schema.product(product_id);


--
-- TOC entry 4896 (class 2606 OID 65741)
-- Name: product_sale product_sale_staff_id_fkey; Type: FK CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.product_sale
    ADD CONSTRAINT product_sale_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES jeyo_schema.staff(staff_id);


--
-- TOC entry 4893 (class 2606 OID 65712)
-- Name: stock_movement stock_movement_product_id_fkey; Type: FK CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.stock_movement
    ADD CONSTRAINT stock_movement_product_id_fkey FOREIGN KEY (product_id) REFERENCES jeyo_schema.product(product_id);


--
-- TOC entry 4894 (class 2606 OID 65717)
-- Name: stock_movement stock_movement_staff_id_fkey; Type: FK CONSTRAINT; Schema: jeyo_schema; Owner: postgres
--

ALTER TABLE ONLY jeyo_schema.stock_movement
    ADD CONSTRAINT stock_movement_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES jeyo_schema.staff(staff_id);


-- Completed on 2026-11-21 12:20:00

--
-- PostgreSQL database dump complete
--

\unrestrict sHbxddBY9UN8CawYTDOPpy8gH99tyOHvoRQHMcaFro5VjSvT6eN52ZHcZodnxCK

